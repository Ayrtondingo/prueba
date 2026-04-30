import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createClerkClient } from '@clerk/clerk-sdk-node';

@Injectable()
export class ClerkAuthGuard implements CanActivate {
  private readonly clerkClient = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
  });

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!process.env.CLERK_SECRET_KEY) {
      console.error(
        '--- ERROR: CLERK_SECRET_KEY no esta configurada en el backend ---',
      );
      throw new UnauthorizedException(
        'Servidor sin CLERK_SECRET_KEY configurada',
      );
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      console.error('--- ERROR: No llego el header de Authorization ---');
      throw new UnauthorizedException('No se envio el token');
    }

    const token = authHeader.split(' ')[1];

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
      const decoded = await this.clerkClient.verifyToken(token);
      request.user = { id: decoded.sub };
      return true;
    } catch (err: any) {
      console.error('--- ERROR DE VALIDACION CLERK ---');
      console.error('Mensaje:', err?.message);
      console.error(
        'Codigo:',
        err?.code || err?.errors?.[0]?.code || 'sin_codigo',
      );
      throw new UnauthorizedException(
        'Token de Clerk invalido. Cierra sesion, vuelve a entrar y verifica que NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY y CLERK_SECRET_KEY pertenezcan a la misma app de Clerk.',
      );
    }
  }
}
