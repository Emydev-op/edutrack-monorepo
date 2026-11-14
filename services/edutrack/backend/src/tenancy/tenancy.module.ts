import { Global, Module } from '@nestjs/common';
import { TenantPrismaService } from './tenant-prisma.service.js';
import { TenantResolverService } from './tenant-resolver.service.js';
import { TenantHostMiddleware } from './tenant-host.middleware.js';

@Global()
@Module({
  providers: [TenantPrismaService, TenantResolverService, TenantHostMiddleware],
  exports: [TenantPrismaService, TenantResolverService, TenantHostMiddleware],
})
export class TenancyModule {}
