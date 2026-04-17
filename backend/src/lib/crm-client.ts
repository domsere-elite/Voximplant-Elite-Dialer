import axios, { AxiosInstance, AxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { config } from '../config.js';
import { logger } from './logger.js';

export interface CRMAccount {
  id: string;
  name?: string;
  phone?: string;
  balance?: number;
  status?: string;
  [key: string]: unknown;
}

export interface CRMContact {
  id: string;
  accountId: string;
  phone: string;
  timezone?: string;
  priority?: number;
  [key: string]: unknown;
}

export interface CRMUser {
  id: string;
  email: string;
  role: 'rep' | 'supervisor' | 'admin' | string;
  name?: string;
  [key: string]: unknown;
}

export interface LogCallData {
  duration: number;
  outcome: string;
  agentId: string;
  voximplantCallId: string;
  recordingUrl?: string;
  notes?: string;
}

export interface ComplianceLogData {
  accountId?: string;
  phone: string;
  check: 'dnc' | 'tcpa' | 'reg_f' | 'account_status';
  result: 'pass' | 'block';
  reason?: string;
  campaignId?: string;
}

export class CRMClient {
  private http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: config.crm.baseUrl,
      timeout: 10_000,
      headers: {
        'X-Dialer-Key': config.crm.apiKey,
        'Content-Type': 'application/json',
      },
    });

    axiosRetry(this.http, {
      retries: 3,
      retryDelay: (retryCount) => Math.pow(2, retryCount - 1) * 1000, // 1s, 2s, 4s
      retryCondition: (error: AxiosError) => {
        const status = error.response?.status ?? 0;
        return status >= 500 && status < 600;
      },
      onRetry: (count, err) => {
        logger.warn('crm-client retry', { count, err: err.message });
      },
    });
  }

  async checkDNC(phone: string): Promise<{ blocked: boolean; reason?: string }> {
    const res = await this.http.get('/api/voice/dnc', { params: { phone } });
    return res.data;
  }

  async getAccount(id: string): Promise<CRMAccount> {
    const res = await this.http.get(`/api/work/${id}`);
    return res.data;
  }

  async getTCPACompliance(id: string): Promise<{ count: number; lastCallAt: Date | null }> {
    const res = await this.http.get(`/api/work/${id}/tcpa-compliance`);
    return {
      count: res.data.count ?? 0,
      lastCallAt: res.data.lastCallAt ? new Date(res.data.lastCallAt) : null,
    };
  }

  async logCall(id: string, data: LogCallData): Promise<{ success: boolean }> {
    const res = await this.http.post(`/api/work/${id}/call`, data);
    return res.data;
  }

  async updateStatus(id: string, status: string, userId: string): Promise<void> {
    await this.http.patch(`/api/work/${id}/status`, { status, userId });
  }

  async logCompliance(data: ComplianceLogData): Promise<void> {
    await this.http.post('/api/voice/tools/log-compliance', data);
  }

  async getCampaignAccounts(campaignId: string): Promise<CRMContact[]> {
    const res = await this.http.get(`/api/voice/campaigns/${campaignId}/accounts`);
    return res.data;
  }

  async searchAccounts(query: string): Promise<CRMAccount[]> {
    const res = await this.http.get('/api/work/search', { params: { q: query } });
    return res.data;
  }

  async verifyLogin(email: string, password: string): Promise<CRMUser | null> {
    try {
      const res = await this.http.post('/api/auth/dialer-verify', { email, password });
      return res.data;
    } catch (err) {
      const axErr = err as AxiosError;
      if (axErr.response?.status === 401 || axErr.response?.status === 403) {
        return null;
      }
      throw err;
    }
  }
}

export const crmClient = new CRMClient();
