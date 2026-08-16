using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using PosInterface;

namespace PosBridge
{
    // Minimal hand-rolled JSON (flat command objects in, flat/1-level-nested results out) —
    // avoids depending on System.Web.Extensions just to talk to the Electron parent over stdio.
    static class Json
    {
        public static Dictionary<string, object> ParseObject(string s)
        {
            int i = 0;
            SkipWs(s, ref i);
            return (Dictionary<string, object>)ParseValue(s, ref i);
        }

        static void SkipWs(string s, ref int i)
        {
            while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
        }

        static object ParseValue(string s, ref int i)
        {
            SkipWs(s, ref i);
            char c = s[i];
            if (c == '{') return ParseObj(s, ref i);
            if (c == '"') return ParseString(s, ref i);
            if (c == 't') { i += 4; return true; }
            if (c == 'f') { i += 5; return false; }
            if (c == 'n') { i += 4; return null; }
            return ParseNumber(s, ref i);
        }

        static Dictionary<string, object> ParseObj(string s, ref int i)
        {
            var d = new Dictionary<string, object>();
            i++; // {
            SkipWs(s, ref i);
            if (s[i] == '}') { i++; return d; }
            while (true)
            {
                SkipWs(s, ref i);
                string key = ParseString(s, ref i);
                SkipWs(s, ref i);
                i++; // :
                object val = ParseValue(s, ref i);
                d[key] = val;
                SkipWs(s, ref i);
                if (s[i] == ',') { i++; continue; }
                if (s[i] == '}') { i++; break; }
            }
            return d;
        }

        static string ParseString(string s, ref int i)
        {
            i++; // opening quote
            var sb = new StringBuilder();
            while (s[i] != '"')
            {
                if (s[i] == '\\')
                {
                    i++;
                    char e = s[i];
                    switch (e)
                    {
                        case 'n': sb.Append('\n'); break;
                        case 't': sb.Append('\t'); break;
                        case 'r': sb.Append('\r'); break;
                        case '"': sb.Append('"'); break;
                        case '\\': sb.Append('\\'); break;
                        case '/': sb.Append('/'); break;
                        case 'u':
                            string hex = s.Substring(i + 1, 4);
                            sb.Append((char)Convert.ToInt32(hex, 16));
                            i += 4;
                            break;
                        default: sb.Append(e); break;
                    }
                }
                else sb.Append(s[i]);
                i++;
            }
            i++; // closing quote
            return sb.ToString();
        }

        static object ParseNumber(string s, ref int i)
        {
            int start = i;
            while (i < s.Length && (char.IsDigit(s[i]) || s[i] == '-' || s[i] == '+' || s[i] == '.' || s[i] == 'e' || s[i] == 'E')) i++;
            string numStr = s.Substring(start, i - start);
            double d;
            double.TryParse(numStr, System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out d);
            return d;
        }

        public static string Escape(string s)
        {
            if (s == null) return "";
            var sb = new StringBuilder();
            foreach (char c in s)
            {
                switch (c)
                {
                    case '"': sb.Append("\\\""); break;
                    case '\\': sb.Append("\\\\"); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    default:
                        if (c < 0x20) sb.AppendFormat("\\u{0:x4}", (int)c);
                        else sb.Append(c);
                        break;
                }
            }
            return sb.ToString();
        }
    }

    class JObj
    {
        readonly StringBuilder sb = new StringBuilder();
        bool first = true;
        public JObj() { sb.Append('{'); }
        void Sep() { if (!first) sb.Append(','); first = false; }
        public JObj Add(string key, string val)
        {
            Sep();
            sb.Append('"').Append(Json.Escape(key)).Append("\":");
            if (val == null) sb.Append("null");
            else sb.Append('"').Append(Json.Escape(val)).Append('"');
            return this;
        }
        public JObj Add(string key, bool val)
        {
            Sep();
            sb.Append('"').Append(Json.Escape(key)).Append("\":").Append(val ? "true" : "false");
            return this;
        }
        public JObj Add(string key, int val)
        {
            Sep();
            sb.Append('"').Append(Json.Escape(key)).Append("\":").Append(val);
            return this;
        }
        public JObj AddRaw(string key, string rawJson)
        {
            Sep();
            sb.Append('"').Append(Json.Escape(key)).Append("\":").Append(rawJson);
            return this;
        }
        public override string ToString() { return sb.ToString() + "}"; }
    }

    class Program : ITransactionDoneHandler
    {
        static PCPos pcPos;
        static readonly object outLock = new object();

        static void Main(string[] args)
        {
            try { Console.OutputEncoding = Encoding.UTF8; } catch { }
            var program = new Program();
            WriteEvent(new JObj().Add("type", "ready").ToString());

            string line;
            while ((line = Console.In.ReadLine()) != null)
            {
                string trimmed = line.Trim();
                if (trimmed.Length == 0) continue;
                try
                {
                    var cmd = Json.ParseObject(trimmed);
                    program.HandleCommand(cmd);
                }
                catch (Exception ex)
                {
                    WriteEvent(new JObj().Add("type", "error").Add("error", ex.Message).ToString());
                }
            }
        }

        static void WriteEvent(string json)
        {
            lock (outLock)
            {
                Console.Out.WriteLine(json);
                Console.Out.Flush();
            }
        }

        static string S(Dictionary<string, object> d, string key)
        {
            object v;
            if (d.TryGetValue(key, out v) && v != null) return v.ToString();
            return "";
        }

        static int I(Dictionary<string, object> d, string key, int def)
        {
            object v;
            if (d.TryGetValue(key, out v) && v != null)
            {
                double dd;
                if (double.TryParse(v.ToString(), out dd)) return (int)dd;
            }
            return def;
        }

        void HandleCommand(Dictionary<string, object> cmd)
        {
            string action = S(cmd, "cmd");
            switch (action)
            {
                case "init":
                    HandleInit(cmd);
                    break;
                case "payment":
                    HandlePaymentAsync(cmd);
                    break;
                case "billPayment":
                    HandleBillPaymentAsync(cmd);
                    break;
                case "inquiry":
                    HandleInquiryAsync();
                    break;
                case "stop":
                    HandleStop();
                    break;
                case "exit":
                    Environment.Exit(0);
                    break;
                default:
                    WriteEvent(new JObj().Add("type", "error").Add("error", "دستور ناشناخته: " + action).ToString());
                    break;
            }
        }

        void HandleInit(Dictionary<string, object> cmd)
        {
            try
            {
                pcPos = new PCPos();
                string mode = S(cmd, "mode");
                if (mode == "serial")
                {
                    string comPort = S(cmd, "comPort");
                    int baudRate = I(cmd, "baudRate", 9600);
                    pcPos.InitSerial(comPort, baudRate);
                }
                else
                {
                    string ip = S(cmd, "ip");
                    int port = I(cmd, "port", 17000);
                    pcPos.InitLAN(ip, port);
                }
                WriteEvent(new JObj().Add("type", "initDone").Add("success", true).ToString());
            }
            catch (Exception ex)
            {
                WriteEvent(new JObj().Add("type", "initDone").Add("success", false).Add("error", ex.Message).ToString());
            }
        }

        void HandlePaymentAsync(Dictionary<string, object> cmd)
        {
            string amount = S(cmd, "amount");
            string tashim = S(cmd, "tashim");
            if (tashim.Length == 0) tashim = "1";
            string invoiceNumber = S(cmd, "invoiceNumber");
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    if (pcPos == null) throw new InvalidOperationException("کارتخوان مقداردهی اولیه نشده است");
                    pcPos.DoASyncPayment(amount, tashim, invoiceNumber, DateTime.Now, this);
                }
                catch (Exception ex)
                {
                    WriteEvent(new JObj().Add("type", "error").Add("error", ex.Message).ToString());
                }
            });
        }

        void HandleBillPaymentAsync(Dictionary<string, object> cmd)
        {
            string paymentIds = S(cmd, "paymentIds");
            string billIds = S(cmd, "billIds");
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    if (pcPos == null) throw new InvalidOperationException("کارتخوان مقداردهی اولیه نشده است");
                    pcPos.DoASyncBillPayment(paymentIds, billIds, DateTime.Now, this);
                }
                catch (Exception ex)
                {
                    WriteEvent(new JObj().Add("type", "error").Add("error", ex.Message).ToString());
                }
            });
        }

        void HandleInquiryAsync()
        {
            ThreadPool.QueueUserWorkItem(delegate
            {
                try
                {
                    if (pcPos == null) throw new InvalidOperationException("کارتخوان مقداردهی اولیه نشده است");
                    pcPos.DoASyncInquiry(this);
                }
                catch (Exception ex)
                {
                    WriteEvent(new JObj().Add("type", "error").Add("error", ex.Message).ToString());
                }
            });
        }

        void HandleStop()
        {
            try
            {
                if (pcPos != null) pcPos.Stop();
                WriteEvent(new JObj().Add("type", "stopped").ToString());
            }
            catch (Exception ex)
            {
                WriteEvent(new JObj().Add("type", "error").Add("error", ex.Message).ToString());
            }
        }

        // ITransactionDoneHandler — invoked by PosInterface on its own worker thread when a transaction finishes.
        public void OnTransactionDone(TransactionResult result)
        {
            var resultJson = new JObj()
                .Add("tranType", result.TranType.ToString())
                .Add("errorCode", result.ErrorCode)
                .Add("errorMsg", result.ErrorMsg)
                .Add("paymentAmount", result.PaymentAmount)
                .Add("rrn", result.RRN)
                .Add("stan", result.Stan)
                .Add("dateTime", result.DateTime)
                .Add("merchantId", result.MerchantId)
                .Add("terminalId", result.TerminalId)
                .Add("cardNumber", result.CardNumber)
                .Add("messageId", result.MessageId);

            var payment = result as PaymentResult;
            if (payment != null) resultJson.Add("invoiceNumber", payment.InvoiceNumber);

            var bill = result as BillPaymentResult;
            if (bill != null) resultJson.Add("billId", bill.BillId).Add("paymentId", bill.PaymentId);

            WriteEvent(new JObj().Add("type", "transactionDone").AddRaw("result", resultJson.ToString()).ToString());
        }

        public void OnFinish(string message)
        {
            WriteEvent(new JObj().Add("type", "finish").Add("message", message).ToString());
        }
    }
}
