import { describe, it, expect } from 'vitest';
import { prisma, disconnectPrisma } from '../src/lib/prisma.js';

describe('prisma singleton', () => {
  it('exports a PrismaClient instance', () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma.$connect).toBe('function');
    expect(typeof prisma.$disconnect).toBe('function');
  });

  it('returns the same instance on repeated imports (singleton)', async () => {
    const mod1 = await import('../src/lib/prisma.js');
    const mod2 = await import('../src/lib/prisma.js');
    expect(mod1.prisma).toBe(mod2.prisma);
  });

  it('exposes all expected model delegates', () => {
    expect(prisma.campaign).toBeDefined();
    expect(prisma.agentMapping).toBeDefined();
    expect(prisma.dIDGroup).toBeDefined();
    expect(prisma.phoneNumber).toBeDefined();
    expect(prisma.campaignContact).toBeDefined();
    expect(prisma.callEvent).toBeDefined();
    expect(prisma.agentStatusLog).toBeDefined();
  });

  it('exports disconnectPrisma function', () => {
    expect(typeof disconnectPrisma).toBe('function');
  });
});
