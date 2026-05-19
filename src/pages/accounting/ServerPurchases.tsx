import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function AccountingServerPurchasesPage() {
  const navigate = useNavigate();
  useEffect(() => { navigate('/accounting/purchase-drafts', { replace: true }); }, [navigate]);
  return null;
}
