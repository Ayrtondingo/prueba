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

// Interfaces para tipar las respuestas de la API externa
interface TransactionResponse {
  id: string;
  status: string;
  [key: string]: unknown;
}

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
    // CORRECCIÓN: Nombres de variables según tu archivo .env
    this.centralBankApiUrl =
      this.configService.get<string>('CENTRAL_BANK_URL') ?? '';
    
    this.centralBankApiKey =
      this.configService.get<string>('CENTRAL_BANK_API_KEY') ?? '';
    
    // CORRECCIÓN: En tu .env es CENTRAL_BANK_ENV, no CENTRAL_BANK_ENVIRONMENT
    this.centralBankEnvironment = this.configService.get<string>(
      'CENTRAL_BANK_ENV',
      'test',
    );

    if (!this.centralBankApiUrl || !this.centralBankApiKey) {
      console.error('❌ Error de Configuración: URL o API_KEY no encontradas en .env');
      throw new Error(
        'Config Error: CENTRAL_BANK_URL or API_KEY is undefined.',
      );
    }
  }

  private getHeaders() {
    return {
      'x-api-key': this.centralBankApiKey,
      'x-environment': this.centralBankEnvironment,
      'Content-Type': 'application/json',
    };
  }

  async registerTransaction(
    data: RegisterTransactionDto,
  ): Promise<TransactionResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<TransactionResponse>(
          `${this.centralBankApiUrl}/transactions`,
          data,
          {
            headers: this.getHeaders(),
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      if (error instanceof AxiosError && error.response) {
        // Log para ver por qué rebota la transacción
        console.error('❌ Error Transacción BC:', error.response.data);
        throw error;
      }
      throw new InternalServerErrorException(
        'Error al comunicarse con el Banco Central para registrar la transacción',
      );
    }
  }

  async getTransactions(): Promise<TransactionResponse[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<TransactionResponse[]>(
          `${this.centralBankApiUrl}/transactions`,
          {
            headers: this.getHeaders(),
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      const axiosError = error as AxiosError<{
        message?: string;
        error?: string;
      }>;
      console.error(
        '❌ Error al obtener transacciones:',
        axiosError.response?.data || axiosError.message,
      );
      throw new InternalServerErrorException(
        'Error al listar transacciones del Banco Central',
      );
    }
  }

  async findPersonByAlias(alias: string): Promise<PersonResponse | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<PersonResponse>(
          `${this.centralBankApiUrl}/persons/alias/${alias}`,
          { headers: this.getHeaders() },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      if (error instanceof AxiosError && error.response?.status === 404)
        return null;
      throw new InternalServerErrorException(
        'Error al consultar Alias en Banco Central',
      );
    }
  }

  async findPersonByCbu(cbu: string): Promise<PersonResponse | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<PersonResponse>(
          `${this.centralBankApiUrl}/persons/${cbu}`,
          {
            headers: this.getHeaders(),
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      if (error instanceof AxiosError && error.response?.status === 404)
        return null;
      throw new InternalServerErrorException(
        'Error al consultar CBU en Banco Central',
      );
    }
  }

  async registerPerson(data: RegisterPersonDto): Promise<PersonResponse> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<PersonResponse>(
          `${this.centralBankApiUrl}/persons`,
          data,
          {
            headers: this.getHeaders(),
          },
        ),
      );
      return response.data;
    } catch (error: unknown) {
      if (error instanceof AxiosError && error.response) {
        const status = error.response.status;
        const responseData = error.response.data as {
          message?: string;
          error?: string;
        };

        console.error('❌ Error Registro Persona BC:', responseData);

        if (status === 409) {
          throw new BadRequestException('El DNI ya se encuentra registrado');
        }

        const message =
          responseData?.error ||
          responseData?.message ||
          'Error al registrar persona';
        throw new HttpException(message, status);
      }
      throw new InternalServerErrorException(
        'Error al registrar persona en el Banco Central',
      );
    }
  }
}