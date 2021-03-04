import axios, { AxiosError, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';
import { UserRegisterData } from '../actions/user.actions';
import {
  ApiAccessRequest, ApiNotification, ApiReportSchema, ApiRole, ApiRosterColumnInfo, ApiUnit, ApiUser, ApiWorkspace,
} from '../models/api-response';

const client = axios.create({
  baseURL: `${window.location.origin}/api/`,
  headers: {
    Accept: 'application/json',
  },
});


client.interceptors.response.use(
  (response: AxiosResponse) => {
    return response.data;
  },
  (error: AxiosError) => {
    if (error.response) {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw error.response;
    } else if (error.request) {
      throw error.request;
    } else {
      throw new Error(error.message);
    }
  },
);


axiosRetry(client, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
});

export namespace AccessRequestClient {
  export const fetchAll = (orgId: number): Promise<ApiAccessRequest[]> => {
    return client.get(`access-request/${orgId}`);
  };
}

export namespace NotificationClient {
  export const fetchAll = (orgId: number): Promise<ApiNotification[]> => {
    return client.get(`notification/${orgId}/all`);
  };
}

export namespace RoleClient {
  export const fetchAll = (orgId: number): Promise<ApiRole[]> => {
    return client.get(`role/${orgId}`);
  };
}

export namespace UnitClient {
  export const fetchAll = (orgId: number): Promise<ApiUnit[]> => {
    return client.get(`unit/${orgId}`);
  };
}

export namespace ReportSchemaClient {
  export const fetchAll = (orgId: number): Promise<ApiReportSchema[]> => {
    return client.get(`report/${orgId}`);
  };
}

export namespace RosterClient {
  export type UploadError = {
    error: string,
    edipi?: string,
    line?: number,
    column?: string,
  };
  export interface UploadResponse {
    count: number
    errors: UploadError[] | undefined
  }
  export const fetchColumns = (orgId: number): Promise<ApiRosterColumnInfo[]> => {
    return client.get(`roster/${orgId}/column`);
  };
  export const upload = async (orgId: number, file: File): Promise<UploadResponse> => {
    const formData = new FormData();
    formData.append('roster_csv', file);
    let response: UploadResponse | undefined;
    try {
      response = await client.post(`roster/${orgId}/bulk`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    } catch (error) {
      if (error.data?.errors?.length) {
        return error.data;
      }
      throw error;
    }
    return response ?? { count: -1, errors: [] };
  };
  export const deleteAll = (orgId: number) => {
    return client.delete(`roster/${orgId}/bulk`);
  };
}

export namespace UserClient {
  export const current = (): Promise<ApiUser> => {
    return client.get(`user/current`);
  };

  export const fetchAll = (orgId: number): Promise<ApiUser[]> => {
    return client.get(`user/${orgId}`);
  };

  export const register = (data: UserRegisterData): Promise<ApiUser> => {
    return client.post(`user`, data);
  };
}

export namespace WorkspaceClient {
  export const fetchAll = (orgId: number): Promise<ApiWorkspace[]> => {
    return client.get(`workspace/${orgId}`);
  };
}

export default client;
