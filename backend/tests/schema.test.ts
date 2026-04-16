import { describe, it, expect } from 'vitest';
import {
  PrismaClient,
  Prisma,
  CampaignStatus,
  DialMode,
  CallerIdStrategy,
  AgentStatus,
  ContactStatus,
  CallDirection,
} from '@prisma/client';

describe('Prisma Schema', () => {
  it('exports PrismaClient constructor', () => {
    expect(PrismaClient).toBeDefined();
    expect(typeof PrismaClient).toBe('function');
  });

  it('exports Prisma namespace with types', () => {
    expect(Prisma).toBeDefined();
  });

  it('exposes Campaign model delegate on client', () => {
    const client = new PrismaClient();
    expect(client.campaign).toBeDefined();
    expect(typeof client.campaign.findMany).toBe('function');
    expect(typeof client.campaign.create).toBe('function');
  });

  it('exposes AgentMapping model delegate on client', () => {
    const client = new PrismaClient();
    expect(client.agentMapping).toBeDefined();
    expect(typeof client.agentMapping.findMany).toBe('function');
  });

  it('exposes DIDGroup model delegate on client', () => {
    const client = new PrismaClient();
    expect(client.dIDGroup).toBeDefined();
    expect(typeof client.dIDGroup.findMany).toBe('function');
  });

  it('exposes PhoneNumber model delegate on client', () => {
    const client = new PrismaClient();
    expect(client.phoneNumber).toBeDefined();
    expect(typeof client.phoneNumber.findMany).toBe('function');
  });

  it('exposes CampaignContact model delegate on client', () => {
    const client = new PrismaClient();
    expect(client.campaignContact).toBeDefined();
    expect(typeof client.campaignContact.findMany).toBe('function');
  });

  it('exposes CallEvent model delegate on client', () => {
    const client = new PrismaClient();
    expect(client.callEvent).toBeDefined();
    expect(typeof client.callEvent.findMany).toBe('function');
  });

  it('exposes AgentStatusLog model delegate on client', () => {
    const client = new PrismaClient();
    expect(client.agentStatusLog).toBeDefined();
    expect(typeof client.agentStatusLog.findMany).toBe('function');
  });

  it('exports expected enums', () => {
    expect(CampaignStatus.DRAFT).toBe('DRAFT');
    expect(CampaignStatus.ACTIVE).toBe('ACTIVE');
    expect(DialMode.MANUAL).toBe('MANUAL');
    expect(DialMode.PREDICTIVE).toBe('PREDICTIVE');
    expect(CallerIdStrategy.FIXED).toBe('FIXED');
    expect(AgentStatus.AVAILABLE).toBe('AVAILABLE');
    expect(ContactStatus.PENDING).toBe('PENDING');
    expect(CallDirection.OUTBOUND).toBe('OUTBOUND');
  });
});
