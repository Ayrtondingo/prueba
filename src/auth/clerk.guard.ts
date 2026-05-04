import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createClerkClient } from '@clerk/clerk-sdk-node';
import { Request } from 'express';

// Definimos la interfaz para el request extendido
interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly clerkClient = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
  });

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secretKey = process.env.CLERK_SECRET_KEY;

    if (!secretKey) {
      console.error(
        '--- ERROR: CLERK_SECRET_KEY no esta configurada en el backend ---',
      );
      throw new UnauthorizedException(
        'Servidor sin CLERK_SECRET_KEY configurada',
      );
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      console.error('--- ERROR: No llego el header de Authorization ---');
      throw new UnauthorizedException('No se envio el token');
    }

    const parts = authHeader.split(' ');
    const token = parts.length === 2 ? parts[1] : null;

    if (
      !token ||
      token === 'null' ||
      token === 'undefined' ||
      token.split('.').length !== 3
    ) {
      console.error('--- ERROR: JWT mal formado ---');
      console.error('Lo que recibio el backend fue:', token);
      throw new UnauthorizedException('Token invalido o mal formado');
    }

    try {
      // verifyToken devuelve un payload con la propiedad 'sub' (el ID de usuario)
      const decoded = await this.clerkClient.verifyToken(token);

      request.user = { id: decoded.sub };
      return true;
    } catch (err: unknown) {
      // Manejo seguro del error de tipo 'unknown'
      const error = err as {
        message?: string;
        code?: string;
        errors?: Array<{ code: string }>;
      };

      console.error('--- ERROR DE VALIDACION CLERK ---');
      console.error('Mensaje:', error.message);
      console.error(
        'Codigo:',
        error.code || error.errors?.[0]?.code || 'sin_codigo',
      );

      throw new UnauthorizedException(
        'Token de Clerk invalido. Cierra sesion, vuelve a entrar y verifica las llaves de Clerk.',
      );
    }
  }
}
