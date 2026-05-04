import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe());

  app.enableCors({
    origin: '*', // Permite que el frontend conecte sin problemas
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // USAMOS EL PUERTO 4001 PARA EVITAR EL ERROR EADDRINUSE DEL 4000
  await app.listen(4001);
  console.log(`🚀 Backend corriendo en: http://localhost:4001/api`);
}
bootstrap();