import { v4 as uuidv4 } from 'uuid';

// Limits use: -1 = unlimited, 0 = not available
const PLANS = [
  {
    slug: 'free',
    name: 'Free',
    description: 'Everything you need to start meeting online',
    monthlyPrice: 0,
    yearlyPrice: 0,
    sortOrder: 1,
    features: [
      '5 meetings per month',
      '60-minute meeting length',
      'Up to 25 participants',
      'Screen sharing & chat',
      'Polls & Q&A',
      '1 team workspace'
    ],
    limits: {
      meetingsPerMonth: 5,
      meetingDurationMinutes: 60,
      participantsPerMeeting: 25,
      recordingMinutesPerMonth: 0,
      storageGB: 1,
      maxTeams: 1,
      canRecord: false,
      canTranscribe: false,
      canBreakout: false,
      canPoll: true
    }
  },
  {
    slug: 'pro',
    name: 'Pro',
    description: 'For professionals who record and revisit every meeting',
    monthlyPrice: 12,
    yearlyPrice: 120,
    sortOrder: 2,
    features: [
      'Unlimited meetings',
      '3-hour meeting length',
      'Up to 100 participants',
      '600 recording minutes / month',
      'AI transcription & transcripts',
      '10 team workspaces',
      'Email support'
    ],
    limits: {
      meetingsPerMonth: -1,
      meetingDurationMinutes: 180,
      participantsPerMeeting: 100,
      recordingMinutesPerMonth: 600,
      storageGB: 50,
      maxTeams: 10,
      canRecord: true,
      canTranscribe: true,
      canBreakout: false,
      canPoll: true
    }
  },
  {
    slug: 'business',
    name: 'Business',
    description: 'Advanced collaboration for growing teams',
    monthlyPrice: 29,
    yearlyPrice: 290,
    sortOrder: 3,
    features: [
      'Unlimited meetings',
      '8-hour meeting length',
      'Up to 300 participants',
      '3,000 recording minutes / month',
      'AI transcription & transcripts',
      'Breakout rooms',
      '50 team workspaces',
      'Priority support'
    ],
    limits: {
      meetingsPerMonth: -1,
      meetingDurationMinutes: 480,
      participantsPerMeeting: 300,
      recordingMinutesPerMonth: 3000,
      storageGB: 500,
      maxTeams: 50,
      canRecord: true,
      canTranscribe: true,
      canBreakout: true,
      canPoll: true
    }
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    description: 'Unlimited scale with dedicated support',
    monthlyPrice: 99,
    yearlyPrice: 990,
    sortOrder: 4,
    features: [
      'Unlimited everything',
      'No meeting length limits',
      'Unlimited participants',
      'Unlimited recording & storage',
      'AI transcription & transcripts',
      'Breakout rooms, polls & Q&A',
      'Unlimited team workspaces',
      'Dedicated support & SLA'
    ],
    limits: {
      meetingsPerMonth: -1,
      meetingDurationMinutes: -1,
      participantsPerMeeting: -1,
      recordingMinutesPerMonth: -1,
      storageGB: -1,
      maxTeams: -1,
      canRecord: true,
      canTranscribe: true,
      canBreakout: true,
      canPoll: true
    }
  }
];

export async function up(queryInterface, Sequelize) {
  for (const plan of PLANS) {
    const existingId = await queryInterface.rawSelect('SubscriptionPlans', {
      where: { slug: plan.slug }
    }, ['id']);

    if (existingId) {
      await queryInterface.bulkUpdate('SubscriptionPlans', {
        name: plan.name,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        yearlyPrice: plan.yearlyPrice,
        currency: 'USD',
        features: JSON.stringify(plan.features),
        limits: JSON.stringify(plan.limits),
        isActive: true,
        sortOrder: plan.sortOrder,
        updatedAt: new Date()
      }, { slug: plan.slug });
      console.log(`Subscription plan updated: ${plan.name}`);
    } else {
      await queryInterface.bulkInsert('SubscriptionPlans', [{
        id: uuidv4(),
        name: plan.name,
        slug: plan.slug,
        description: plan.description,
        monthlyPrice: plan.monthlyPrice,
        yearlyPrice: plan.yearlyPrice,
        currency: 'USD',
        features: JSON.stringify(plan.features),
        limits: JSON.stringify(plan.limits),
        isActive: true,
        sortOrder: plan.sortOrder,
        createdAt: new Date(),
        updatedAt: new Date()
      }]);
      console.log(`Subscription plan created: ${plan.name}`);
    }
  }
}

export async function down(queryInterface) {
  await queryInterface.bulkDelete('SubscriptionPlans', {
    slug: PLANS.map(p => p.slug)
  });
}
