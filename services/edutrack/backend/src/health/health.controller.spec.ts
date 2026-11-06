import { Test } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service.js';
import { REDIS_CLIENT } from '../redis/redis.constants.js';
import { StorageService } from '../storage/storage.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  let controller: HealthController;
  const redis = { ping: vi.fn() };
  const storage = { ping: vi.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: { $queryRawUnsafe: vi.fn() } },
        { provide: StorageService, useValue: storage },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('reports liveness', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
  });
});
