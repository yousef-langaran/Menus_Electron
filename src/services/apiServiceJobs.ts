import { api, apiConfigReady } from './apiBase';

// ─── Service Jobs ─────────────────────────────────────────────────────────────

export async function getServiceBoards(restaurantId: number, token: string): Promise<any[]> {
  await apiConfigReady;
  const response = await api.get('/service-jobs/boards', {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

export interface CreateServiceJobElectronDto {
  restaurantId: number;
  boardId: number;
  statusId: number;
  title: string;
  customerName?: string;
  customerPhone?: string;
  customerId?: number | null;
  assigneeId?: number | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  dueDate?: string | null;
  estimatedAmount?: number;
  formData?: Record<string, any>;
}

export async function createServiceJobRemote(
  dto: CreateServiceJobElectronDto,
  token: string,
): Promise<any> {
  await apiConfigReady;
  const { restaurantId, ...body } = dto;
  const response = await api.post('/service-jobs/jobs', body, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function listServiceJobsRemote(
  params: { restaurantId: number; boardId?: number; page?: number; limit?: number },
  token: string,
): Promise<{ data: any[]; total: number }> {
  await apiConfigReady;
  const response = await api.get('/service-jobs/jobs', {
    params,
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function getServiceJobRemote(
  jobId: number,
  restaurantId: number,
  token: string,
): Promise<any> {
  await apiConfigReady;
  const response = await api.get(`/service-jobs/jobs/${jobId}`, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export interface UpdateServiceJobElectronDto {
  title?: string;
  customerName?: string | null;
  customerPhone?: string | null;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  dueDate?: string | null;
  estimatedAmount?: number;
  assigneeId?: number | null;
}

export async function updateServiceJobRemote(
  jobId: number,
  restaurantId: number,
  body: UpdateServiceJobElectronDto,
  token: string,
): Promise<any> {
  await apiConfigReady;
  const response = await api.patch(`/service-jobs/jobs/${jobId}`, body, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function moveServiceJobStatusRemote(
  jobId: number,
  restaurantId: number,
  statusId: number,
  token: string,
): Promise<any> {
  await apiConfigReady;
  const response = await api.patch(
    `/service-jobs/jobs/${jobId}/move`,
    { statusId },
    {
      params: { restaurantId },
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  return response.data;
}

export interface ServiceJobItemElectronDto {
  itemType: 'product' | 'service' | 'labor';
  description: string;
  quantity: number;
  unitPrice: number;
  deductFromInventory?: boolean;
}

export async function addServiceJobItemRemote(
  jobId: number,
  restaurantId: number,
  item: ServiceJobItemElectronDto,
  token: string,
): Promise<any> {
  await apiConfigReady;
  const response = await api.post(`/service-jobs/jobs/${jobId}/items`, item, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function updateServiceJobItemRemote(
  jobId: number,
  itemId: number,
  restaurantId: number,
  item: ServiceJobItemElectronDto,
  token: string,
): Promise<any> {
  await apiConfigReady;
  const response = await api.patch(`/service-jobs/jobs/${jobId}/items/${itemId}`, item, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function removeServiceJobItemRemote(
  jobId: number,
  itemId: number,
  restaurantId: number,
  token: string,
): Promise<any> {
  await apiConfigReady;
  const response = await api.delete(`/service-jobs/jobs/${jobId}/items/${itemId}`, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function issueServiceJobInvoiceRemote(
  jobId: number,
  restaurantId: number,
  opts: { warehouseId?: number; vatRate?: number; saleDate?: string },
  token: string,
): Promise<any> {
  await apiConfigReady;
  const response = await api.post(`/service-jobs/jobs/${jobId}/issue-invoice`, opts, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function addServiceJobAttachmentRemote(
  jobId: number,
  restaurantId: number,
  file: File,
  token: string,
  visibleToCustomer = false,
): Promise<any> {
  await apiConfigReady;
  const form = new FormData();
  form.append('file', file);
  const response = await api.post(`/service-jobs/jobs/${jobId}/attachments`, form, {
    params: { restaurantId, visibleToCustomer },
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function getServiceJobStaffRemote(
  restaurantId: number,
  token: string,
): Promise<{ id: number; name: string; mobile: string }[]> {
  await apiConfigReady;
  const response = await api.get('/service-jobs/staff', {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return Array.isArray(response.data) ? response.data : [];
}

export async function phoneLookupServiceJobRemote(
  phone: string,
  token: string,
): Promise<{ found: boolean; customerId?: number; name?: string }> {
  await apiConfigReady;
  const response = await api.get('/service-jobs/phone-lookup', {
    params: { phone },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}

export async function registerServiceCustomerRemote(
  restaurantId: number,
  data: { phone: string; firstName?: string; lastName?: string },
  token: string,
): Promise<{ customerId: number; name: string }> {
  await apiConfigReady;
  const response = await api.post('/service-jobs/customers', data, {
    params: { restaurantId },
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
}
