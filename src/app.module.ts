import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { ProductsModule } from './products/products.module.js';

@Module({
  imports: [ProductsModule],
  controllers: [HealthController],
})
export class AppModule {}
