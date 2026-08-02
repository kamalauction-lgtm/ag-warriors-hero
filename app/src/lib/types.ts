export type Country = 'MY' | 'ID'
export type Locale = 'en' | 'id' | 'bm'
export type Theme = 'light' | 'dark'
export type Role = 'agent' | 'leader' | 'country_admin' | 'master_admin'
export type CareerRank = 'REN' | 'L' | 'TL' | 'HOT' | 'TM' | 'VP'
export type DealStage =
  | 'calling'
  | 'follow_up'
  | 'appointment'
  | 'booking'
  | 'loan'
  | 'closed'

export interface User {
  id: string
  name: string
  phone: string
  email: string
  country: Country
  role: Role
  careerRank: CareerRank
  isElite: boolean
  captainName?: string
  leaderId?: string | null
  team?: string
  avatarColor: string
  points: number
  level: number
  levelName: string
  /* false = must pass the onboarding gate (M1) before the app unlocks */
  onboarded?: boolean
  pendingApproval?: boolean
}

export interface Deal {
  id: string
  client: string
  project: string
  unit?: string
  price: number // local currency major units
  commission: number // local currency
  stage: DealStage
  agentId: string
  agentName: string
  country: Country
  ago: string
}

export interface Lead {
  id: string
  name: string
  phone: string
  source: string
  status: 'new' | 'hot' | 'warm' | 'cold'
  assignedTo?: string
  country: Country
  ago: string
}

export interface Task {
  id: string
  label: string
  slot: string
  status: 'done' | 'pending' | 'postponed'
}

export interface LeaderRow {
  id: string
  name: string
  team: string
  points: number
  closings: number
  salesVolume: number
  isElite: boolean
  captainName?: string
  rank: CareerRank
  country: Country
}

export interface Reward {
  id: string
  title: string
  tier: string
  category: 'Trip' | 'Cash & Car' | 'Bumiputera'
  targetLabel: string
  progress: number // 0..100
  country: Country
}
