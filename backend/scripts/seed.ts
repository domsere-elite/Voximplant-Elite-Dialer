import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default admin user
  const adminPassword = await bcrypt.hash('admin123!', 12);
  await prisma.user.upsert({
    where: { email: 'admin@collections.local' },
    update: {},
    create: {
      email: 'admin@collections.local',
      passwordHash: adminPassword,
      firstName: 'System',
      lastName: 'Admin',
      role: 'admin',
      status: 'offline',
    },
  });

  // Create test supervisor
  const supPassword = await bcrypt.hash('supervisor123!', 12);
  await prisma.user.upsert({
    where: { email: 'supervisor@collections.local' },
    update: {},
    create: {
      email: 'supervisor@collections.local',
      passwordHash: supPassword,
      firstName: 'Test',
      lastName: 'Supervisor',
      role: 'supervisor',
      status: 'offline',
    },
  });

  // Create test agent
  const agentPassword = await bcrypt.hash('agent123!', 12);
  await prisma.user.upsert({
    where: { email: 'agent@collections.local' },
    update: {},
    create: {
      email: 'agent@collections.local',
      passwordHash: agentPassword,
      firstName: 'Test',
      lastName: 'Agent',
      role: 'agent',
      status: 'offline',
      extension: '1001',
    },
  });

  // Create default disposition codes
  const dispositions = [
    { code: 'payment_made', label: 'Payment Made', category: 'positive', sortOrder: 1 },
    { code: 'payment_promised', label: 'Payment Promised', category: 'positive', sortOrder: 2 },
    { code: 'payment_plan', label: 'Payment Plan Arranged', category: 'positive', sortOrder: 3 },
    { code: 'callback_requested', label: 'Callback Requested', category: 'callback', requiresCallback: true, sortOrder: 4 },
    { code: 'no_answer', label: 'No Answer', category: 'neutral', sortOrder: 5 },
    { code: 'voicemail', label: 'Left Voicemail', category: 'neutral', sortOrder: 6 },
    { code: 'busy', label: 'Busy', category: 'neutral', sortOrder: 7 },
    { code: 'refused', label: 'Refused to Pay', category: 'negative', sortOrder: 8 },
    { code: 'disputed', label: 'Debt Disputed', category: 'negative', sortOrder: 9 },
    { code: 'wrong_number', label: 'Wrong Number', category: 'negative', sortOrder: 10 },
    { code: 'disconnected', label: 'Disconnected Number', category: 'negative', sortOrder: 11 },
    { code: 'cease_desist', label: 'Cease & Desist Request', category: 'negative', sortOrder: 12 },
    { code: 'deceased', label: 'Deceased', category: 'negative', sortOrder: 13 },
    { code: 'bankruptcy', label: 'Bankruptcy', category: 'negative', sortOrder: 14 },
    { code: 'attorney', label: 'Represented by Attorney', category: 'negative', sortOrder: 15 },
  ];

  for (const d of dispositions) {
    await prisma.dispositionCode.upsert({
      where: { code: d.code },
      update: d,
      create: d,
    });
  }

  // Create default system settings
  const settings = [
    { key: 'dialer_mode', value: 'preview' },
    { key: 'max_concurrent_calls', value: '10' },
    { key: 'recording_enabled', value: 'true' },
    { key: 'amd_enabled', value: 'true' },
    { key: 'ai_transfer_enabled', value: 'true' },
    { key: 'company_name', value: 'Elite Portfolio Management' },
  ];

  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: s,
    });
  }

  console.log('Seed complete!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
