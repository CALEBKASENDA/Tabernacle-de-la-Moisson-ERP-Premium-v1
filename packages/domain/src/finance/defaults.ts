export const DEFAULT_FINANCE_CATEGORIES = [
  'Dîme des dîmes',
  'Offrande missionnaire',
  'Offrande ordinaire',
  'Travaux 10-30%',
  'Rétrocession 20%',
  'Actions de grâces',
  'Investissement',
  'Assistance croyants',
] as const;

export const DEFAULT_FUNDS = [
  'Fonds Construction',
  'Fonds Missionnaire',
  'Fonds Assistance Sociale',
  'Fonds Jeunesse',
  'Fonds Chorale',
  'Fonds École du Dimanche',
  'Fonds Investissement',
] as const;

export const DEFAULT_CURRENCIES = [
  { code: 'USD', name: 'Dollar américain' },
  { code: 'CDF', name: 'Franc congolais' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'Livre sterling' },
] as const;

export const EVENT_TYPES = [
  'CULTE_DOMINICAL',
  'CULTE_SEMAINE',
  'VEILLEE',
  'CONVENTION',
  'CAMPAGNE_EVANGELISATION',
  'SEMINAIRE',
  'CONFERENCE',
  'REUNION_SPECIALE',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  CULTE_DOMINICAL: 'Culte dominical',
  CULTE_SEMAINE: 'Culte de semaine',
  VEILLEE: 'Veillée',
  CONVENTION: 'Convention',
  CAMPAGNE_EVANGELISATION: "Campagne d'évangélisation",
  SEMINAIRE: 'Séminaire',
  CONFERENCE: 'Conférence',
  REUNION_SPECIALE: 'Réunion spéciale',
};
