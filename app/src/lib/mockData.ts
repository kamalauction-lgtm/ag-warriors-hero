import type {
  Country,
  Deal,
  DealStage,
  Lead,
  LeaderRow,
  Reward,
  Task,
  User,
} from './types'

export const STAGES: { key: DealStage; label: string; tint: string }[] = [
  { key: 'calling', label: 'Calling', tint: '#6366f1' },
  { key: 'follow_up', label: 'Follow-Up', tint: '#0ea5e9' },
  { key: 'appointment', label: 'Appointment', tint: '#8b5cf6' },
  { key: 'booking', label: 'Booking', tint: '#f59e0b' },
  { key: 'loan', label: 'Loan', tint: '#ec4899' },
  { key: 'closed', label: 'Closed', tint: '#22c55e' },
]

const AV = ['#e0a52f', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#f43f5e', '#14b8a6', '#f97316']

// ---- Login personas (demo) ----
export const PERSONAS: User[] = [
  {
    id: 'a_kamal', name: 'Kamal AG', phone: '+60 12-345 6789', email: 'kamal@iqiag.com',
    country: 'MY', role: 'master_admin', careerRank: 'VP', isElite: false,
    team: 'AG Group', avatarColor: AV[0], points: 4820, level: 12, levelName: 'Legend',
  },
  {
    id: 'a_aisyah', name: 'Aisyah Rahman', phone: '+60 13-888 2020', email: 'aisyah@iqiag.com',
    country: 'MY', role: 'leader', careerRank: 'HOT', isElite: true, captainName: 'Captain Aisyah',
    team: 'AG Titans', avatarColor: AV[4], points: 3120, level: 9, levelName: 'Ksatria',
  },
  {
    id: 'a_budi', name: 'Budi Santoso', phone: '+62 812-3456-789', email: 'budi@iqiag.id',
    country: 'ID', role: 'agent', careerRank: 'L', isElite: false,
    team: 'AG Garuda', avatarColor: AV[2], points: 1740, level: 6, levelName: 'Pejuang',
  },
]

// ---- Tasks (My Day) ----
export const TASKS: Task[] = [
  { id: 't1', label: 'Call 10 warm leads from EXSIM', slot: '09:00', status: 'done' },
  { id: 't2', label: 'Follow up Encik Lim (booking)', slot: '10:30', status: 'done' },
  { id: 't3', label: 'Site visit — Residensi appointment', slot: '14:00', status: 'pending' },
  { id: 't4', label: 'Post daily activity on IG', slot: '17:00', status: 'pending' },
  { id: 't5', label: 'Submit loan docs for Sarah', slot: '18:30', status: 'postponed' },
]

export const WEEKLY = [
  { d: 'M', done: 6, planned: 8 },
  { d: 'T', done: 8, planned: 8 },
  { d: 'W', done: 5, planned: 7 },
  { d: 'T', done: 7, planned: 9 },
  { d: 'F', done: 9, planned: 9 },
  { d: 'S', done: 3, planned: 5 },
  { d: 'S', done: 2, planned: 4 },
]

// ---- Deals per country ----
const DEALS_MY: Deal[] = [
  { id: 'd1', client: 'Lim Wei Jie', project: 'EXSIM Residensi', unit: 'A-12-03', price: 620000, commission: 15500, stage: 'closed', agentId: 'a_aisyah', agentName: 'Aisyah', country: 'MY', ago: '2h' },
  { id: 'd2', client: 'Sarah Kaur', project: 'Asteriaz', unit: 'B-08-11', price: 480000, commission: 12000, stage: 'loan', agentId: 'a_aisyah', agentName: 'Aisyah', country: 'MY', ago: '5h' },
  { id: 'd3', client: 'Raj Kumar', project: 'The Fifth', unit: 'C-20-02', price: 750000, commission: 18750, stage: 'booking', agentId: 'a_kamal', agentName: 'Kamal', country: 'MY', ago: '1d' },
  { id: 'd4', client: 'Nurul Huda', project: 'EXSIM Residensi', unit: 'A-15-08', price: 540000, commission: 13500, stage: 'appointment', agentId: 'a_kamal', agentName: 'Kamal', country: 'MY', ago: '1d' },
  { id: 'd5', client: 'David Tan', project: 'Aster Hill', price: 890000, commission: 22250, stage: 'appointment', agentId: 'a_aisyah', agentName: 'Aisyah', country: 'MY', ago: '2d' },
  { id: 'd6', client: 'Farah Aziz', project: 'Asteriaz', price: 460000, commission: 11500, stage: 'follow_up', agentId: 'a_kamal', agentName: 'Kamal', country: 'MY', ago: '3d' },
  { id: 'd7', client: 'Chong Meng', project: 'The Fifth', price: 700000, commission: 17500, stage: 'follow_up', agentId: 'a_aisyah', agentName: 'Aisyah', country: 'MY', ago: '3d' },
  { id: 'd8', client: 'Aminah Yusof', project: 'Aster Hill', price: 820000, commission: 20500, stage: 'calling', agentId: 'a_kamal', agentName: 'Kamal', country: 'MY', ago: '4d' },
  { id: 'd9', client: 'Kevin Loh', project: 'EXSIM Residensi', price: 590000, commission: 14750, stage: 'calling', agentId: 'a_aisyah', agentName: 'Aisyah', country: 'MY', ago: '5d' },
]

const DEALS_ID: Deal[] = [
  { id: 'i1', client: 'Andi Wijaya', project: 'Grand Sungkono', unit: 'Tower A-1201', price: 2400000000, commission: 60000000, stage: 'closed', agentId: 'a_budi', agentName: 'Budi', country: 'ID', ago: '3h' },
  { id: 'i2', client: 'Siti Nurhaliza', project: 'Puri Mansion', price: 1800000000, commission: 45000000, stage: 'loan', agentId: 'a_budi', agentName: 'Budi', country: 'ID', ago: '6h' },
  { id: 'i3', client: 'Rudi Hartono', project: 'Bandung Icon', unit: 'B-905', price: 1250000000, commission: 31250000, stage: 'booking', agentId: 'a_budi', agentName: 'Budi', country: 'ID', ago: '1d' },
  { id: 'i4', client: 'Dewi Lestari', project: 'Grand Sungkono', price: 2100000000, commission: 52500000, stage: 'appointment', agentId: 'a_budi', agentName: 'Budi', country: 'ID', ago: '2d' },
  { id: 'i5', client: 'Agus Salim', project: 'Puri Mansion', price: 1650000000, commission: 41250000, stage: 'follow_up', agentId: 'a_budi', agentName: 'Budi', country: 'ID', ago: '3d' },
  { id: 'i6', client: 'Maya Sari', project: 'Bandung Icon', price: 980000000, commission: 24500000, stage: 'calling', agentId: 'a_budi', agentName: 'Budi', country: 'ID', ago: '4d' },
]

const LEADS_MY: Lead[] = [
  { id: 'l1', name: 'Hafiz Omar', phone: '+60 12-700 1122', source: 'Facebook Ad', status: 'hot', assignedTo: 'Aisyah', country: 'MY', ago: '12m' },
  { id: 'l2', name: 'Michelle Yeo', phone: '+60 16-233 4455', source: 'marketing4u', status: 'new', country: 'MY', ago: '40m' },
  { id: 'l3', name: 'Zul Ariffin', phone: '+60 19-888 7766', source: 'Booth — MidValley', status: 'warm', assignedTo: 'Kamal', country: 'MY', ago: '2h' },
  { id: 'l4', name: 'Priya Nair', phone: '+60 11-2345 6789', source: 'IG DM', status: 'hot', country: 'MY', ago: '3h' },
  { id: 'l5', name: 'Tan Ah Beng', phone: '+60 12-999 0000', source: 'Masterlist', status: 'cold', assignedTo: 'Aisyah', country: 'MY', ago: '1d' },
]

const LEADS_ID: Lead[] = [
  { id: 'j1', name: 'Bagus Pratama', phone: '+62 813-1100-2200', source: 'Facebook Ad', status: 'hot', assignedTo: 'Budi', country: 'ID', ago: '20m' },
  { id: 'j2', name: 'Indah Permata', phone: '+62 812-4567-8899', source: 'marketing4u', status: 'new', country: 'ID', ago: '1h' },
  { id: 'j3', name: 'Joko Widodo', phone: '+62 811-2233-4455', source: 'Roadshow — Bandung', status: 'warm', assignedTo: 'Budi', country: 'ID', ago: '4h' },
  { id: 'j4', name: 'Rina Melati', phone: '+62 856-9988-7766', source: 'IG DM', status: 'cold', country: 'ID', ago: '1d' },
]

const LEADERS_MY: LeaderRow[] = [
  { id: 'a_aisyah', name: 'Aisyah Rahman', team: 'AG Titans', points: 3120, closings: 7, salesVolume: 4200000, isElite: true, captainName: 'Captain Aisyah', rank: 'HOT', country: 'MY' },
  { id: 'a_kamal', name: 'Kamal AG', team: 'AG Group', points: 4820, closings: 5, salesVolume: 3600000, isElite: false, rank: 'VP', country: 'MY' },
  { id: 'a_m3', name: 'Faizal Hassan', team: 'AG Titans', points: 2740, closings: 6, salesVolume: 3100000, isElite: true, captainName: 'Captain Faizal', rank: 'TL', country: 'MY' },
  { id: 'a_m4', name: 'Wong Li Ping', team: 'AG Eagles', points: 2210, closings: 4, salesVolume: 2450000, isElite: false, rank: 'L', country: 'MY' },
  { id: 'a_m5', name: 'Suriani Md', team: 'AG Eagles', points: 1980, closings: 3, salesVolume: 1900000, isElite: false, rank: 'REN', country: 'MY' },
]

const LEADERS_ID: LeaderRow[] = [
  { id: 'a_budi', name: 'Budi Santoso', team: 'AG Garuda', points: 1740, closings: 6, salesVolume: 9800000000, isElite: true, captainName: 'Captain Budi', rank: 'L', country: 'ID' },
  { id: 'a_i2', name: 'Dewi Anggraini', team: 'AG Garuda', points: 1560, closings: 5, salesVolume: 8200000000, isElite: false, rank: 'TL', country: 'ID' },
  { id: 'a_i3', name: 'Eko Prasetyo', team: 'AG Merah Putih', points: 1320, closings: 4, salesVolume: 6100000000, isElite: false, rank: 'REN', country: 'ID' },
  { id: 'a_i4', name: 'Ratna Sari', team: 'AG Merah Putih', points: 1100, closings: 3, salesVolume: 4500000000, isElite: false, rank: 'REN', country: 'ID' },
]

const REWARDS_MY: Reward[] = [
  { id: 'r1', title: 'Dubai Elite Trip 2026', tier: 'Platinum', category: 'Trip', targetLabel: 'RM 3,000,000 sales', progress: 68, country: 'MY' },
  { id: 'r2', title: 'Cash + Tesla Campaign', tier: 'Gold', category: 'Cash & Car', targetLabel: 'RM 5,000,000 sales', progress: 42, country: 'MY' },
  { id: 'r3', title: 'Bumiputera Excellence', tier: 'Silver', category: 'Bumiputera', targetLabel: '8 closings', progress: 75, country: 'MY' },
]

const REWARDS_ID: Reward[] = [
  { id: 's1', title: 'Bali Leaders Retreat', tier: 'Platinum', category: 'Trip', targetLabel: 'Rp 10 M sales', progress: 55, country: 'ID' },
  { id: 's2', title: 'Umrah Reward 2026', tier: 'Gold', category: 'Trip', targetLabel: '6 closings', progress: 80, country: 'ID' },
]

export const getDeals = (c: Country) => (c === 'MY' ? DEALS_MY : DEALS_ID)
export const getLeads = (c: Country) => (c === 'MY' ? LEADS_MY : LEADS_ID)
export const getLeaders = (c: Country) => (c === 'MY' ? LEADERS_MY : LEADERS_ID)
export const getRewards = (c: Country) => (c === 'MY' ? REWARDS_MY : REWARDS_ID)

export function pipelineValue(c: Country) {
  return getDeals(c)
    .filter((d) => d.stage !== 'closed')
    .reduce((s, d) => s + d.price, 0)
}
export function closedValue(c: Country) {
  return getDeals(c)
    .filter((d) => d.stage === 'closed')
    .reduce((s, d) => s + d.price, 0)
}
