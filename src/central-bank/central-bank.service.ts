import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AxiosError } from 'axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

interface RegisterTransactionDto {
  cbuOrigen: string;
  cbuDestino: string;
  importe: number;
  saldoOrigen: number;
}

interface RegisterPersonDto {
  nombre: string;
  apellido: string;
  dni: string;
}

interface PersonResponse {
  cbu: string;
  nombre: string;
  apellido: string;
  dni: string;
}

@Injectable()
export class CentralBankService {
  private readonly centralBankApiUrl: string;
  private readonly centralBankApiKey: string;
  private readonly centralBankEnvironment: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.centralBankApiUrl = this.configService.get<string>(
      'CENTRAL_BANK_API_URL',
    );
    this.centralBankApiKey = this.configService.get<string>(
      'CENTRAL_BANK_API_KEY',
    );
    this.centralBankEnvironment = this.configService.get<string>(
      'CENTRAL_BANK_ENVIRONMENT',
      'test',
    ); // Default a 'test'

    if (!this.centralBankApiUrl) {
      throw new Error(
        'Config Error: CENTRAL_BANK_API_URL is undefined. Check your .env file.',
      );
    }

    if (!this.centralBankApiKey) {
      throw new Error(
        'Config Error: CENTRAL_BANK_API_KEY is undefined. Check your .env file.',
      );
    }
  }

  private getHeaders() {
    return {
      'x-api-key': this.centralBankApiKey,
      'x-environment': this.centralBankEnvironment,
    };
  }

  async registerTransaction(data: RegisterTransactionDto): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.centralBankApiUrl}/transactions`, data, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error: any) {
      if (error instanceof AxiosError && error.response) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error al comunicarse con el Banco Central para registrar la transacción',
      );
    }
  }

  async getTransactions(): Promise<any[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.centralBankApiUrl}/transactions`, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error: any) {
      console.error(
        'Error al obtener transacciones del Banco Central:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException(
        'Error al listar transacciones del Banco Central',
      );
    }
  }

  async findPersonByAlias(alias: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.centralBankApiUrl}/persons/alias/${alias}`,
          {
            headers: this.getHeaders(),
          },
        ),
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) return null;
      throw new InternalServerErrorException(
        'Error al consultar Alias en Banco Central',
      );
    }
  }

  async findPersonByCbu(cbu: string): Promise<any> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.centralBankApiUrl}/persons/${cbu}`, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) return null;
      throw new InternalServerErrorException(
        'Error al consultar CBU en Banco Central',
      );
    }
  }

  async registerPerson(data: RegisterPersonDto): Promise<PersonResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.centralBankApiUrl}/persons`, data, {
          headers: this.getHeaders(),
        }),
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 409) {
        throw new BadRequestException('El DNI ya se encuentra registrado');
      }
      if (error.response) {
        const message =
          error.response.data?.error ||
          error.response.data?.message ||
          'Error al registrar persona en el Banco Central';
        throw new HttpException(message, error.response.status);
      }
      throw new InternalServerErrorException(
        'Error al registrar persona en el Banco Central',
      );
    }
  }
}
