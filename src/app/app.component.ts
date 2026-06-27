import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ChipModule } from 'primeng/chip';
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { TabViewModule } from 'primeng/tabview';
import { TableModule } from 'primeng/table';
import { ADMIN_PASSWORD } from './admin-config';
//import groupStandings from '../assets/data/group-standings.json';
import playerColorsData from '../assets/data/player-colors.json';
import scoringRulesData from '../assets/data/scoring-rules.json';
//import teamResultsData from '../assets/data/team-results.json';
import {
  getGroupStandings,
  getKnockoutBracketConfig,
  getScoringRules,
  getTeamResults,
  replaceGroupStandings,
  saveGroupStanding,
  saveKnockoutBracketConfig,
  saveTeamResult,
  seedGroupStandingsIfEmpty,
  seedScoringRulesIfMissing,
  seedTeamResultsIfEmpty
} from '../firebase.js';

type TeamResult = {
  team: string;
  flag: string;
  milestones: Record<ProgressKey, number>;
};

type TeamSelection = {
  team: string;
  flag: string;
  group?: string;
};

type GroupStanding = {
  group: string;
  team: string;
  flag: string;
  playerName?: string;
  playerColor?: string;
  G: number;
  E: number;
  P: number;
  GF: number;
  GC: number;
  DG: number;
  PTS: number;
  PJ: number;
};

type EditableGroupStanding = Omit<GroupStanding, 'DG' | 'PTS' | 'PJ'>;

type Participant = {
  name: string;
  color: string;
  selections: TeamSelection[];
};

type PlayerColor = {
  name: string;
  color: string;
};

type ProgressKey =
  | 'groupWin'
  | 'round32'
  | 'round16'
  | 'round8'
  | 'quarterFinal'
  | 'semiFinal'
  | 'final'
  | 'champion';

type StageDefinition = {
  key: ProgressKey;
  label: string;
  points: number;
};

type ScoringRules = {
  stages: StageDefinition[];
};

type EnrichedSelection = TeamSelection & {
  wins: number;
  roundsAdvanced: number;
  points: number;
};

const STAGE_ORDER: ProgressKey[] = [
  'groupWin',
  'round32',
  'round16',
  'round8',
  'quarterFinal',
  'semiFinal',
  'final',
  'champion'
];

const MAX_COUNTED_SELECTIONS = 5;
const DEFAULT_PLAYER_COLOR = '#64748b';

type ParticipantSummary = {
  name: string;
  color: string;
  selectionCount: number;
  totalPoints: number;
  wins: number;
  roundsAdvanced: number;
  selections: EnrichedSelection[];
  predictionPoints?: number;
};

type GroupSelection = {
  team: string;
  flag: string;
  participantName: string;
  participantColor: string;
};

type GroupPrediction = {
  participantName: string;
  participantColor: string;
  G: number;
  E: number;
  P: number;
  GF: number;
  GC: number;
  DG: number;
  PTS: number;
  PJ: number;
};

type WorldCupGroup = {
  group: string;
  teams: GroupSelection[];
  predictions: GroupPrediction[];
};

type ThirdPlaceRow = GroupPrediction & {
  group: string;
};

type BracketSide = 'left' | 'right';

type KnockoutPosition = 1 | 2 | 3;

type OpeningSlotRule = {
  seed: string;
  position: KnockoutPosition;
  group?: string;
  allowedThirdGroups?: string[];
};

type BracketSlot = {
  seed: string;
  label: string;
  teamId: string | null;
  color: string | null;
};

type BracketMatch = {
  id: string;
  title: string;
  slots: [BracketSlot, BracketSlot];
  fixtureTeams: [FixtureTeamOption | null, FixtureTeamOption | null];
};

type KnockoutTeamOption = {
  id: string;
  name: string;
  color: string;
  group: string;
  position: number;
  seed: string;
};

type FixtureTeamOption = {
  id: string;
  team: string;
  flag: string;
  group: string;
};

type EditableBracketMatch = {
  id: string;
  title: string;
  slotTeamIds: [string | null, string | null];
  fixtureTeamIds: [string | null, string | null];
  winnerTeamId: string | null;
};

type EditableBracketRound = {
  key: string;
  label: string;
  side: BracketSide;
  offset: number;
  gap: number;
  matches: EditableBracketMatch[];
};

type EditableFinalRound = {
  label: string;
  match: EditableBracketMatch;
};

type EditableKnockoutBracket = {
  leftRounds: EditableBracketRound[];
  rightRounds: EditableBracketRound[];
  finalRound: EditableFinalRound;
};

type BracketRound = {
  key: string;
  label: string;
  side: BracketSide;
  offset: number;
  gap: number;
  matches: BracketMatch[];
};

type FinalRound = {
  label: string;
  match: BracketMatch;
};

type KnockoutBracket = {
  leftRounds: BracketRound[];
  rightRounds: BracketRound[];
  finalRound: FinalRound;
};

type BracketSlide = {
  key: string;
  label: string;
  matches: BracketMatch[];
  final?: boolean;
  sideLabel?: string;
};

const EMPTY_MILESTONES: Record<ProgressKey, number> = {
  groupWin: 0,
  round32: 0,
  round16: 0,
  round8: 0,
  quarterFinal: 0,
  semiFinal: 0,
  final: 0,
  champion: 0
};

const BRACKET_LAYOUT = [
  { key: 'round32', label: '16vos', matchCount: 8, offset: 0, gap: 16 },
  { key: 'round16', label: '8vos', matchCount: 4, offset: 60, gap: 64 },
  { key: 'quarterfinals', label: '4tos', matchCount: 2, offset: 152, gap: 188 },
  { key: 'semifinals', label: 'Semis', matchCount: 1, offset: 396, gap: 0 }
] as const;

const OPENING_MATCH_RULES: Record<BracketSide, [OpeningSlotRule, OpeningSlotRule][]> = {
  left: [
    [
      { seed: '1E', group: 'E', position: 1 },
      { seed: '3ABCDF', position: 3, allowedThirdGroups: ['A', 'B', 'C', 'D', 'F'] }
    ],
    [
      { seed: '1I', group: 'I', position: 1 },
      { seed: '3CDFGH', position: 3, allowedThirdGroups: ['C', 'D', 'F', 'G', 'H'] }
    ],
    [
      { seed: '2A', group: 'A', position: 2 },
      { seed: '2B', group: 'B', position: 2 }
    ],
    [
      { seed: '1F', group: 'F', position: 1 },
      { seed: '2C', group: 'C', position: 2 }
    ],
    [
      { seed: '2K', group: 'K', position: 2 },
      { seed: '2L', group: 'L', position: 2 }
    ],
    [
      { seed: '1H', group: 'H', position: 1 },
      { seed: '2J', group: 'J', position: 2 }
    ],
    [
      { seed: '1D', group: 'D', position: 1 },
      { seed: '3BEFIJ', position: 3, allowedThirdGroups: ['B', 'E', 'F', 'I', 'J'] }
    ],
    [
      { seed: '1G', group: 'G', position: 1 },
      { seed: '3AEHIJ', position: 3, allowedThirdGroups: ['A', 'E', 'H', 'I', 'J'] }
    ]
  ],
  right: [
    [
      { seed: '1C', group: 'C', position: 1 },
      { seed: '2F', group: 'F', position: 2 }
    ],
    [
      { seed: '2E', group: 'E', position: 2 },
      { seed: '2I', group: 'I', position: 2 }
    ],
    [
      { seed: '1A', group: 'A', position: 1 },
      { seed: '3CEFHI', position: 3, allowedThirdGroups: ['C', 'E', 'F', 'H', 'I'] }
    ],
    [
      { seed: '1L', group: 'L', position: 1 },
      { seed: '3EHIJK', position: 3, allowedThirdGroups: ['E', 'H', 'I', 'J', 'K'] }
    ],
    [
      { seed: '1J', group: 'J', position: 1 },
      { seed: '2H', group: 'H', position: 2 }
    ],
    [
      { seed: '2D', group: 'D', position: 2 },
      { seed: '2G', group: 'G', position: 2 }
    ],
    [
      { seed: '1B', group: 'B', position: 1 },
      { seed: '3EFGIJ', position: 3, allowedThirdGroups: ['E', 'F', 'G', 'I', 'J'] }
    ],
    [
      { seed: '1K', group: 'K', position: 1 },
      { seed: '3DEIJL', position: 3, allowedThirdGroups: ['D', 'E', 'I', 'J', 'L'] }
    ]
  ]
};

const EMPTY_KNOCKOUT_BRACKET = createEmptyEditableKnockoutBracket();
const EMPTY_RENDERED_KNOCKOUT = createRenderedKnockoutBracket(EMPTY_KNOCKOUT_BRACKET, [], []);

function createEditableBracketSide(side: BracketSide): EditableBracketRound[] {
  const sideCode = side === 'left' ? 'I' : 'D';

  return BRACKET_LAYOUT.map((roundConfig) => {
    const matches = Array.from({ length: roundConfig.matchCount }, (_, matchIndex): EditableBracketMatch => {
      const title = `${sideCode}${matchIndex + 1}`;

      return {
        id: `${side}-${roundConfig.key}-${matchIndex + 1}`,
        title,
        slotTeamIds: [null, null],
        fixtureTeamIds: [null, null],
        winnerTeamId: null
      };
    });

    return {
      ...roundConfig,
      side,
      matches
    };
  });
}

function createEmptyEditableKnockoutBracket(): EditableKnockoutBracket {
  const leftRounds = createEditableBracketSide('left');
  const rightRounds = createEditableBracketSide('right');

  return {
    leftRounds,
    rightRounds,
    finalRound: {
      label: 'Final',
      match: {
        id: 'final',
        title: 'Partido final',
        slotTeamIds: [null, null],
        fixtureTeamIds: [null, null],
        winnerTeamId: null
      }
    }
  };
}

function createRenderedKnockoutBracket(
  bracket: EditableKnockoutBracket,
  teamOptions: KnockoutTeamOption[],
  fixtureOptions: FixtureTeamOption[]
): KnockoutBracket {
  const teamMap = new Map(teamOptions.map((team) => [team.id, team]));
  const fixtureMap = new Map(fixtureOptions.map((team) => [team.id, team]));

  const createSlot = (teamId: string | null, fallbackLabel: string, fallbackSeed = ''): BracketSlot => {
    const team = teamId ? teamMap.get(teamId) : null;

    return {
      seed: team?.seed ?? fallbackSeed,
      label: team?.name ?? fallbackLabel,
      teamId: team?.id ?? null,
      color: team?.color ?? null
    };
  };

  const mapRounds = (rounds: EditableBracketRound[]): BracketRound[] =>
    rounds.map((round, roundIndex) => ({
      key: round.key,
      label: round.label,
      side: round.side,
      offset: round.offset,
      gap: round.gap,
      matches: round.matches.map((match, matchIndex) => {
        const fallbackLabels = roundIndex === 0
          ? ['Por definir', 'Por definir']
          : [
            `Ganador ${rounds[roundIndex - 1].matches[matchIndex * 2].title}`,
            `Ganador ${rounds[roundIndex - 1].matches[(matchIndex * 2) + 1].title}`
          ];
        const fallbackSeeds = roundIndex === 0
          ? OPENING_MATCH_RULES[round.side][matchIndex].map((rule) => rule.seed)
          : ['', ''];

        return {
          id: match.id,
          title: match.title,
          slots: [
            createSlot(match.slotTeamIds[0], fallbackLabels[0], fallbackSeeds[0]),
            createSlot(match.slotTeamIds[1], fallbackLabels[1], fallbackSeeds[1])
          ],
          fixtureTeams: [
            fixtureMap.get(match.fixtureTeamIds[0] ?? '') ?? null,
            fixtureMap.get(match.fixtureTeamIds[1] ?? '') ?? null
          ]
        };
      })
    }));

  const leftRounds = mapRounds(bracket.leftRounds);
  const rightBaseRounds = mapRounds(bracket.rightRounds);

  return {
    leftRounds,
    rightRounds: [...rightBaseRounds].reverse(),
    finalRound: {
      label: bracket.finalRound.label,
      match: {
        id: bracket.finalRound.match.id,
        title: bracket.finalRound.match.title,
        slots: [
          createSlot(
            bracket.finalRound.match.slotTeamIds[0],
            `Ganador ${bracket.leftRounds[bracket.leftRounds.length - 1].matches[0].title}`
          ),
          createSlot(
            bracket.finalRound.match.slotTeamIds[1],
            `Ganador ${bracket.rightRounds[bracket.rightRounds.length - 1].matches[0].title}`
          )
        ],
        fixtureTeams: [
          fixtureMap.get(bracket.finalRound.match.fixtureTeamIds[0] ?? '') ?? null,
          fixtureMap.get(bracket.finalRound.match.fixtureTeamIds[1] ?? '') ?? null
        ]
      }
    }
  };
}

function createMobileBracketSlides(bracket: KnockoutBracket): BracketSlide[] {
  return [
    ...bracket.leftRounds.map((round) => ({
      key: `left-${round.key}`,
      label: round.label,
      matches: round.matches,
      sideLabel: 'Lado izquierdo'
    })),
    {
      key: 'final',
      label: bracket.finalRound.label,
      matches: [bracket.finalRound.match],
      final: true
    },
    ...bracket.rightRounds.map((round) => ({
      key: `right-${round.key}`,
      label: round.label,
      matches: round.matches,
      sideLabel: 'Lado derecho'
    }))
  ];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, CardModule, ChipModule, DividerModule, TabViewModule, TableModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  private readonly playerColorMap = this.createPlayerColorMap(playerColorsData as PlayerColor[]);

  loading = true;
  error = '';
  summaries: ParticipantSummary[] = [];
  participants: Participant[] = [];
  scoringRules: ScoringRules | null = null;
  stageDefinitions: StageDefinition[] = [];
  editableResults: TeamResult[] = [];
  groupStandings: GroupStanding[] = [];
  standingsGroups: string[] = [];
  worldCupGroups: WorldCupGroup[] = [];
  thirdPlaceRows: ThirdPlaceRow[] = [];
  knockoutQualifiedTeams: KnockoutTeamOption[] = [];
  knockoutTeamOptions: KnockoutTeamOption[] = [];
  fixtureTeamOptions: FixtureTeamOption[] = [];
  editableKnockoutBracket: EditableKnockoutBracket = EMPTY_KNOCKOUT_BRACKET;
  knockoutBracket: KnockoutBracket = EMPTY_RENDERED_KNOCKOUT;
  mobileBracketSlides: BracketSlide[] = createMobileBracketSlides(EMPTY_RENDERED_KNOCKOUT);
  showKnockoutBracket = false;
  adminPassword = '';
  adminError = '';
  adminUnlocked = false;
  adminPanelOpen = true;
  statusMessage = '';

  totalParticipants = 0;
  totalSelections = 0;
  totalPoints = 0;

  async ngOnInit(): Promise<void> {
    try {
      await this.seedFirebaseData();

      const [results, scoring, standings, knockoutConfig] = await Promise.all([
        this.loadFirebaseTeamResults(),
        this.loadFirebaseScoringRules(),
        this.loadFirebaseGroupStandings(),
        this.loadFirebaseKnockoutBracket()
      ]);

      this.applyGroupStandingsState(standings);
      this.scoringRules = scoring;
      this.stageDefinitions = scoring.stages;
      this.editableResults = this.normalizeResults(results);
      this.applyKnockoutState(knockoutConfig);
      this.recalculateSummaries();
      this.loading = false;
    } catch (error) {
      this.error = 'No se pudieron cargar los datos del Mundial.';
      this.loading = false;
      console.error(error);
    }
  }

  unlockAdmin(password: string): void {
    if (password === ADMIN_PASSWORD) {
      this.adminUnlocked = true;
      this.adminError = '';
      this.statusMessage = 'Administrador desbloqueado.';
      return;
    }

    this.adminError = 'Contraseña incorrecta.';
    this.statusMessage = '';
  }

  resetAdminPasswordFeedback(): void {
    this.adminError = '';
  }

  toggleAdminPanel(): void {
    this.adminPanelOpen = !this.adminPanelOpen;
  }

  setStandingText(group: string, team: string, field: 'playerName' | 'playerColor', value: string): void {
    this.updateStanding(group, team, (standing) => ({
      ...standing,
      [field]: value
    }));
    void this.persistStanding(group, team);
  }

  setStandingNumber(group: string, team: string, field: 'G' | 'E' | 'P' | 'GF' | 'GC', rawValue: string | number): void {
    const parsed = Number(rawValue);
    const nextValue = Number.isNaN(parsed) ? 0 : Math.max(0, Math.trunc(parsed));

    this.updateStanding(group, team, (standing) => ({
      ...standing,
      [field]: nextValue
    }));
    void this.persistStanding(group, team);
  }

  setMilestone(team: string, stageKey: ProgressKey, enabled: boolean): void {
    this.editableResults = this.editableResults.map((result) => {
      if (result.team !== team) {
        return result;
      }

      return {
        ...result,
        milestones: {
          ...result.milestones,
          [stageKey]: stageKey === 'groupWin'
            ? this.clampGroupWins(result.milestones.groupWin)
            : (enabled ? 1 : 0)
        }
      };
    });

    this.recalculateSummaries();
    void this.persistTeamResult(team);
  }

  setGroupWins(team: string, rawValue: string | number): void {
    const parsed = Number(rawValue);
    const nextValue = this.clampGroupWins(parsed);

    this.editableResults = this.editableResults.map((result) => {
      if (result.team !== team) {
        return result;
      }

      return {
        ...result,
        milestones: {
          ...result.milestones,
          groupWin: nextValue
        }
      };
    });

    this.recalculateSummaries();
    void this.persistTeamResult(team);
  }

  downloadEditableResults(): void {
    this.downloadJsonFile('team-results.json', this.editableResults);
    this.statusMessage = 'JSON listo para descargar.';
  }

  async downloadGroupStandings(): Promise<void> {
    try {
      const standings = await this.loadFirebaseGroupStandings();
      this.downloadJsonFile('group-standings.json', this.serializeGroupStandings(this.normalizeStandings(standings)));
      this.statusMessage = 'Respaldo de groupStandings descargado desde Firebase.';
    } catch (error) {
      console.error('Error descargando groupStandings desde Firebase:', error);
      this.statusMessage = 'No se pudo descargar el respaldo de groupStandings.';
    }
  }

  async uploadGroupStandingsFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    try {
      const rawContent = await file.text();
      const standings = this.parseImportedGroupStandings(rawContent);
      const result = await replaceGroupStandings(standings);
      await this.reloadOriginalGroupStandings();
      this.statusMessage = `Firebase actualizada con ${result.upserted} standings. ${result.deleted} registros antiguos eliminados.`;
    } catch (error) {
      console.error('Error cargando respaldo de groupStandings:', error);
      this.statusMessage = error instanceof Error
        ? error.message
        : 'No se pudo cargar el archivo de groupStandings.';
    } finally {
      input.value = '';
    }
  }

  restoreOriginalResults(): void {
    if (!this.scoringRules) {
      return;
    }

    void this.reloadOriginalResults();
  }

  restoreOriginalGroupStandings(): void {
    void this.reloadOriginalGroupStandings();
  }

  isStageChecked(team: string, stageKey: ProgressKey): boolean {
    const result = this.editableResults.find((item) => item.team === team);
    return (result?.milestones?.[stageKey] ?? 0) > 0;
  }

  trackByName(_: number, summary: ParticipantSummary): string {
    return summary.name;
  }

  imgError(event: Event) {
    const target = event.target as HTMLImageElement;
    if (target) {
      target.style.display = 'none';
    }
  }

  closeAdminPanel(): void {
    this.adminPanelOpen = false;
  }

  trackByTeam(_: number, result: TeamResult): string {
    return result.team;
  }

  trackByGroup(_: number, group: WorldCupGroup): string {
    return group.group;
  }

  trackByStandingGroup(_: number, group: string): string {
    return group;
  }

  trackByStandingRow(_: number, standing: GroupStanding): string {
    return `${standing.group}-${standing.team}`;
  }

  getStandingsForGroup(group: string): GroupStanding[] {
    return this.groupStandings
      .filter((standing) => standing.group === group)
      .sort((left, right) => left.team.localeCompare(right.team, 'es'));
  }

  getTopTeamsForGroup(group: string): Set<string> {
    const list = this.groupStandings
      .filter((s) => s.group === group)
      .slice()
      .sort((a, b) => (b.PTS - a.PTS) || (b.DG - a.DG) || (b.GF - a.GF) || a.team.localeCompare(b.team, 'es'));

    return new Set(list.slice(0, 2).map((s) => s.team));
  }

  getRenderedRound(side: BracketSide, roundKey: string): BracketRound | undefined {
    const rounds = side === 'left' ? this.knockoutBracket.leftRounds : this.knockoutBracket.rightRounds;
    return rounds.find((round) => round.key === roundKey);
  }

  getRenderedMatch(side: BracketSide, roundKey: string, matchId: string): BracketMatch | undefined {
    return this.getRenderedRound(side, roundKey)?.matches.find((match) => match.id === matchId);
  }

  getKnockoutOpeningRule(side: BracketSide, matchId: string, slotIndex: 0 | 1): OpeningSlotRule | null {
    const matchIndex = this.getOpeningMatchIndex(side, matchId);

    if (matchIndex < 0) {
      return null;
    }

    return OPENING_MATCH_RULES[side][matchIndex][slotIndex];
  }

  isEditableKnockoutOpeningSlot(side: BracketSide, matchId: string, slotIndex: 0 | 1): boolean {
    const rule = this.getKnockoutOpeningRule(side, matchId, slotIndex);
    return Boolean(rule?.allowedThirdGroups?.length);
  }

  getKnockoutOpeningOptions(side: BracketSide, matchId: string, slotIndex: 0 | 1): KnockoutTeamOption[] {
    const rule = this.getKnockoutOpeningRule(side, matchId, slotIndex);

    if (!rule?.allowedThirdGroups?.length) {
      return [];
    }

    return this.knockoutTeamOptions.filter((team) =>
      team.position === 3 && rule.allowedThirdGroups!.includes(team.group)
    );
  }

  getKnockoutOpeningSelectOptions(side: BracketSide, matchId: string, slotIndex: 0 | 1): KnockoutTeamOption[] {
    const rule = this.getKnockoutOpeningRule(side, matchId, slotIndex);

    if (!rule) {
      return [];
    }

    if (rule.allowedThirdGroups?.length) {
      return this.getKnockoutOpeningOptions(side, matchId, slotIndex);
    }

    return this.knockoutTeamOptions.filter((team) => team.seed === rule.seed);
  }

  getRenderedOpeningSlot(side: BracketSide, matchId: string, slotIndex: 0 | 1): BracketSlot | null {
    const renderedMatch = this.getRenderedMatch(side, 'round32', matchId);
    return renderedMatch?.slots[slotIndex] ?? null;
  }

  isKnockoutWinner(match: EditableBracketMatch, slotIndex: 0 | 1): boolean {
    return match.winnerTeamId !== null && match.winnerTeamId === match.slotTeamIds[slotIndex];
  }

  isKnockoutTeamTaken(teamId: string, matchId: string, slotIndex: 0 | 1): boolean {
    const openingMatches = [
      ...this.editableKnockoutBracket.leftRounds[0].matches,
      ...this.editableKnockoutBracket.rightRounds[0].matches
    ];

    return openingMatches.some((match) =>
      match.slotTeamIds.some((assignedTeamId, currentSlotIndex) =>
        assignedTeamId === teamId && !(match.id === matchId && currentSlotIndex === slotIndex)
      )
    );
  }

  setKnockoutOpeningTeam(side: BracketSide, matchId: string, slotIndex: 0 | 1, rawTeamId: string): void {
    const nextTeamId = rawTeamId || null;
    const nextBracket = this.cloneEditableKnockoutBracket(this.editableKnockoutBracket);
    const targetMatch = this.getEditableRoundCollection(nextBracket, side)[0].matches.find((match) => match.id === matchId);

    if (!targetMatch) {
      return;
    }

    this.clearAssignedOpeningTeam(nextBracket, nextTeamId, matchId, slotIndex);
    targetMatch.slotTeamIds[slotIndex] = nextTeamId;

    if (nextTeamId && targetMatch.slotTeamIds[slotIndex === 0 ? 1 : 0] === nextTeamId) {
      targetMatch.slotTeamIds[slotIndex === 0 ? 1 : 0] = null;
    }

    this.applyKnockoutState(this.recomputeEditableKnockoutBracket(nextBracket));
    void this.persistKnockoutBracket();
  }

  toggleKnockoutWinner(side: BracketSide | 'final', roundKey: string, matchId: string, slotIndex: 0 | 1): void {
    const nextBracket = this.cloneEditableKnockoutBracket(this.editableKnockoutBracket);
    const targetMatch = side === 'final'
      ? nextBracket.finalRound.match
      : this.getEditableRoundCollection(nextBracket, side)
        .find((round) => round.key === roundKey)
        ?.matches.find((match) => match.id === matchId);

    if (!targetMatch) {
      return;
    }

    const selectedTeamId = targetMatch.slotTeamIds[slotIndex];

    if (!selectedTeamId) {
      return;
    }

    targetMatch.winnerTeamId = targetMatch.winnerTeamId === selectedTeamId ? null : selectedTeamId;

    this.applyKnockoutState(this.recomputeEditableKnockoutBracket(nextBracket));
    void this.persistKnockoutBracket();
  }

  setKnockoutFixtureTeam(side: BracketSide | 'final', roundKey: string, matchId: string, slotIndex: 0 | 1, rawTeamId: string): void {
    const nextBracket = this.cloneEditableKnockoutBracket(this.editableKnockoutBracket);
    const nextTeamId = rawTeamId || null;
    const targetMatch = side === 'final'
      ? nextBracket.finalRound.match
      : this.getEditableRoundCollection(nextBracket, side)
        .find((round) => round.key === roundKey)
        ?.matches.find((match) => match.id === matchId);

    if (!targetMatch) {
      return;
    }

    targetMatch.fixtureTeamIds[slotIndex] = nextTeamId;

    if (nextTeamId && targetMatch.fixtureTeamIds[slotIndex === 0 ? 1 : 0] === nextTeamId) {
      targetMatch.fixtureTeamIds[slotIndex === 0 ? 1 : 0] = null;
    }

    this.applyKnockoutState(nextBracket);
    void this.persistKnockoutBracket();
  }

  resetKnockoutBracketFromStandings(): void {
    this.applyKnockoutState(null);
    this.statusMessage = 'Cuadro final rearmado desde los top 2 de cada grupo.';
    void this.persistKnockoutBracket();
  }

  clearKnockoutWinners(): void {
    const nextBracket = this.cloneEditableKnockoutBracket(this.editableKnockoutBracket);

    nextBracket.leftRounds.forEach((round) => {
      round.matches.forEach((match) => {
        match.winnerTeamId = null;
      });
    });

    nextBracket.rightRounds.forEach((round) => {
      round.matches.forEach((match) => {
        match.winnerTeamId = null;
      });
    });

    nextBracket.finalRound.match.winnerTeamId = null;

    this.applyKnockoutState(this.recomputeEditableKnockoutBracket(nextBracket));
    this.statusMessage = 'Ganadores del cuadro limpiados.';
    void this.persistKnockoutBracket();
  }

  private async reloadOriginalResults(): Promise<void> {
    const results = await this.loadFirebaseTeamResults();
    this.editableResults = this.normalizeResults(results);
    this.recalculateSummaries();
    this.statusMessage = 'Se recargo teamResults desde Firebase.';
  }

  private async reloadOriginalGroupStandings(): Promise<void> {
    const standings = await this.loadFirebaseGroupStandings();
    this.applyGroupStandingsState(standings);
    this.recalculateSummaries();
    this.statusMessage = 'Se recargo el standings desde Firebase.';
  }

  private normalizeResults(results: TeamResult[]): TeamResult[] {
    return results.map((result) => ({
      ...result,
      milestones: {
        ...EMPTY_MILESTONES,
        ...this.normalizeMilestones(result.milestones)
      }
    }));
  }

  private recalculateSummaries(): void {
    if (!this.participants.length || !this.scoringRules) {
      return;
    }

    const resultByTeam = new Map(this.editableResults.map((result) => [result.team, result]));
    const stagePoints = new Map(this.scoringRules.stages.map((stage) => [stage.key, stage.points]));

    this.summaries = this.participants.map((participant) => {
      const selections = participant.selections.map((selection) => {
        const result = resultByTeam.get(selection.team);
        const milestones = result?.milestones ?? EMPTY_MILESTONES;
        const wins = milestones.groupWin ?? 0;
        const roundsAdvanced = STAGE_ORDER.slice(1).reduce((sum, key) => sum + (milestones[key] ?? 0), 0);
        const points = this.scoringRules!.stages.reduce((sum, stage) => {
          if (stage.key === 'groupWin') {
            return sum + ((milestones.groupWin ?? 0) * (stagePoints.get(stage.key) ?? 0));
          }

          return sum + ((milestones[stage.key] ?? 0) > 0 ? (stagePoints.get(stage.key) ?? 0) : 0);
        }, 0);

        return {
          ...selection,
          wins,
          roundsAdvanced,
          points
        } satisfies EnrichedSelection;
      }).sort((left, right) =>
        right.points - left.points ||
        right.roundsAdvanced - left.roundsAdvanced ||
        right.wins - left.wins ||
        left.team.localeCompare(right.team, 'es')
      );

      const countedSelections = selections.slice(0, MAX_COUNTED_SELECTIONS);
      const totalPoints = countedSelections.reduce((sum, selection) => sum + selection.points, 0);

      // predictionPoints: sum of PTS from groupStandings for teams this participant selected
      const standingByTeam = new Map(this.groupStandings.map((s) => [s.team, s]));
      const predictionPoints = participant.selections.reduce((sum, sel) => {
        const s = standingByTeam.get(sel.team);
        return sum + (s?.PTS ?? 0);
      }, 0);

      return {
        name: participant.name,
        color: participant.color,
        selectionCount: selections.length,
        totalPoints,
        predictionPoints,
        wins: selections.reduce((sum, selection) => sum + selection.wins, 0),
        roundsAdvanced: selections.reduce((sum, selection) => sum + selection.roundsAdvanced, 0),
        selections
      } satisfies ParticipantSummary;
    }).sort((left, right) => {
      const leftTotal = left.totalPoints + (left.predictionPoints ?? 0);
      const rightTotal = right.totalPoints + (right.predictionPoints ?? 0);
      return rightTotal - leftTotal;
    });

    this.totalParticipants = this.summaries.length;
    this.totalSelections = this.summaries.reduce((sum, summary) => sum + summary.selectionCount, 0);
    this.totalPoints = this.summaries.reduce((sum, summary) => sum + summary.totalPoints, 0);
  }

  private normalizeStandings(standings: GroupStanding[]): GroupStanding[] {
    return standings.map((standing) => ({
      group: standing.group.toUpperCase(),
      team: standing.team,
      flag: standing.flag,
      playerName: standing.playerName ?? '',
      playerColor: standing.playerColor ?? '#64748b',
      G: standing.G ?? 0,
      E: standing.E ?? 0,
      P: standing.P ?? 0,
      GF: standing.GF ?? 0,
      GC: standing.GC ?? 0,
      DG: (standing.GF ?? 0) - (standing.GC ?? 0),
      PTS: ((standing.G ?? 0) * 3) + (standing.E ?? 0),
      PJ: (standing.G ?? 0) + (standing.E ?? 0) + (standing.P ?? 0)
    }));
  }

  private serializeGroupStandings(standings: GroupStanding[]): EditableGroupStanding[] {
    return standings.map((standing) => ({
      group: standing.group,
      team: standing.team,
      flag: standing.flag,
      playerName: standing.playerName,
      playerColor: standing.playerColor,
      G: standing.G,
      E: standing.E,
      P: standing.P,
      GF: standing.GF,
      GC: standing.GC
    }));
  }

  private applyGroupStandingsState(standings: GroupStanding[]): void {
    this.groupStandings = this.normalizeStandings(standings);
    this.standingsGroups = this.getStandingGroups(this.groupStandings);
    this.participants = this.buildParticipantsFromStandings(this.groupStandings);
    this.worldCupGroups = this.buildWorldCupGroups(this.groupStandings);
    this.thirdPlaceRows = this.buildThirdPlaceRows(this.worldCupGroups);
    this.applyKnockoutState(this.editableKnockoutBracket);
  }

  private getStandingGroups(standings: GroupStanding[]): string[] {
    return Array.from(new Set(standings.map((standing) => standing.group))).sort((left, right) => left.localeCompare(right, 'es'));
  }

  private updateStanding(
    group: string,
    team: string,
    updater: (standing: GroupStanding) => GroupStanding
  ): void {
    this.groupStandings = this.normalizeStandings(
      this.groupStandings.map((standing) => (standing.group === group && standing.team === team ? updater(standing) : standing))
    );
    this.standingsGroups = this.getStandingGroups(this.groupStandings);
    this.participants = this.buildParticipantsFromStandings(this.groupStandings);
    this.worldCupGroups = this.buildWorldCupGroups(this.groupStandings);
    this.recalculateSummaries();
  }

  private async loadFirebaseGroupStandings(): Promise<GroupStanding[]> {
    return await getGroupStandings<GroupStanding>();
  }

  private async loadFirebaseTeamResults(): Promise<TeamResult[]> {
    return await getTeamResults<TeamResult>();
  }

  private async loadFirebaseScoringRules(): Promise<ScoringRules> {
    const rules = await getScoringRules<ScoringRules>();

    if (!rules) {
      throw new Error('No se encontraron scoringRules en Firebase.');
    }

    return rules;
  }

  private async loadFirebaseKnockoutBracket(): Promise<EditableKnockoutBracket | null> {
    return await getKnockoutBracketConfig<EditableKnockoutBracket>();
  }

  private async persistStanding(group: string, team: string): Promise<void> {
    const standing = this.groupStandings.find((item) => item.group === group && item.team === team);

    if (!standing) {
      return;
    }

    try {
      await saveGroupStanding(this.serializeGroupStandings([standing])[0]);
    } catch (error) {
      console.error('Error guardando standing en Firebase:', error);
      this.statusMessage = 'Fallo el guardado del standings en Firebase.';
    }
  }

  private async persistTeamResult(team: string): Promise<void> {
    const result = this.editableResults.find((item) => item.team === team);

    if (!result) {
      return;
    }

    try {
      await saveTeamResult(result);
    } catch (error) {
      console.error('Error guardando teamResults en Firebase:', error);
      this.statusMessage = 'Fallo el guardado de teamResults en Firebase.';
    }
  }

  private async persistKnockoutBracket(): Promise<void> {
    try {
      await saveKnockoutBracketConfig(this.editableKnockoutBracket);
      this.statusMessage = 'Cuadro final guardado en Firebase.';
    } catch (error) {
      console.error('Error guardando knockoutBracket en Firebase:', error);
      this.statusMessage = 'Fallo el guardado del cuadro final en Firebase.';
    }
  }

  private applyKnockoutState(savedBracket: EditableKnockoutBracket | null): void {
    const teamOptions = this.buildKnockoutTeamOptions();
    const qualifiedTeams = this.buildKnockoutQualifiedTeams();
    const fixtureOptions = this.buildFixtureTeamOptions();
    const nextBracket = this.normalizeEditableKnockoutBracket(savedBracket, qualifiedTeams, teamOptions, fixtureOptions);

    this.knockoutQualifiedTeams = qualifiedTeams;
    this.knockoutTeamOptions = teamOptions;
    this.fixtureTeamOptions = fixtureOptions;
    this.editableKnockoutBracket = nextBracket;
    this.knockoutBracket = createRenderedKnockoutBracket(nextBracket, teamOptions, fixtureOptions);
    this.mobileBracketSlides = createMobileBracketSlides(this.knockoutBracket);
  }

  private buildKnockoutQualifiedTeams(): KnockoutTeamOption[] {
    const topTwoByGroup = this.standingsGroups.flatMap((group) => {
      const sortedGroupStandings = this.groupStandings
        .filter((standing) => standing.group === group)
        .slice()
        .sort((left, right) =>
          right.PTS - left.PTS ||
          right.DG - left.DG ||
          right.GF - left.GF ||
          (left.playerName || 'Sin nombre').localeCompare(right.playerName || 'Sin nombre', 'es')
        );

      return sortedGroupStandings.slice(0, 2).map((standing, index) => ({
        id: `${standing.group}-${index + 1}-${this.normalizePlayerName(standing.playerName || 'Sin nombre')}`,
        name: standing.playerName || 'Sin nombre',
        color: standing.playerColor || this.getPlayerColor(standing.playerName || 'Sin nombre'),
        group: standing.group,
        position: index + 1,
        seed: `${index + 1}${standing.group}`
      }));
    });

    const bestThirds = this.thirdPlaceRows.slice(0, 8).map((row) => ({
      id: `${row.group}-3-${this.normalizePlayerName(row.participantName)}`,
      name: row.participantName,
      color: row.participantColor || this.getPlayerColor(row.participantName),
      group: row.group,
      position: 3 as KnockoutPosition,
      seed: `3${row.group}`
    }));

    return [...topTwoByGroup, ...bestThirds];
  }

  private buildKnockoutTeamOptions(): KnockoutTeamOption[] {
    const qualifiedTeams = this.buildKnockoutQualifiedTeams();
    return qualifiedTeams.slice().sort((left, right) =>
      left.position - right.position ||
      left.group.localeCompare(right.group, 'es') ||
      left.name.localeCompare(right.name, 'es')
    );
  }

  private buildFixtureTeamOptions(): FixtureTeamOption[] {
    return this.groupStandings
      .slice()
      .sort((left, right) =>
        left.group.localeCompare(right.group, 'es') ||
        left.team.localeCompare(right.team, 'es')
      )
      .map((standing) => ({
        id: `${standing.group}-${standing.flag}`,
        team: standing.team,
        flag: standing.flag,
        group: standing.group
      }));
  }

  private normalizeEditableKnockoutBracket(
    savedBracket: EditableKnockoutBracket | null,
    qualifiedTeams: KnockoutTeamOption[],
    teamOptions: KnockoutTeamOption[],
    fixtureOptions: FixtureTeamOption[]
  ): EditableKnockoutBracket {
    const defaultBracket = this.createDefaultEditableKnockoutBracket(qualifiedTeams);

    if (!savedBracket) {
      return defaultBracket;
    }

    const nextBracket = this.cloneEditableKnockoutBracket(defaultBracket);
    const validTeamIds = new Set(teamOptions.map((team) => team.id));
    const validFixtureIds = new Set(fixtureOptions.map((team) => team.id));

    this.copySavedOpeningRound('left', nextBracket.leftRounds[0], savedBracket.leftRounds?.[0], validTeamIds, teamOptions);
    this.copySavedOpeningRound('right', nextBracket.rightRounds[0], savedBracket.rightRounds?.[0], validTeamIds, teamOptions);

    this.copySavedWinners(nextBracket.leftRounds, savedBracket.leftRounds, validTeamIds);
    this.copySavedWinners(nextBracket.rightRounds, savedBracket.rightRounds, validTeamIds);
    this.copySavedFixtures(nextBracket.leftRounds, savedBracket.leftRounds, validFixtureIds);
    this.copySavedFixtures(nextBracket.rightRounds, savedBracket.rightRounds, validFixtureIds);

    if (savedBracket.finalRound?.match?.winnerTeamId && validTeamIds.has(savedBracket.finalRound.match.winnerTeamId)) {
      nextBracket.finalRound.match.winnerTeamId = savedBracket.finalRound.match.winnerTeamId;
    }

    if (savedBracket.finalRound?.match?.fixtureTeamIds) {
      nextBracket.finalRound.match.fixtureTeamIds = [
        savedBracket.finalRound.match.fixtureTeamIds[0] && validFixtureIds.has(savedBracket.finalRound.match.fixtureTeamIds[0])
          ? savedBracket.finalRound.match.fixtureTeamIds[0]
          : null,
        savedBracket.finalRound.match.fixtureTeamIds[1] && validFixtureIds.has(savedBracket.finalRound.match.fixtureTeamIds[1])
          ? savedBracket.finalRound.match.fixtureTeamIds[1]
          : null
      ];
    }

    return this.recomputeEditableKnockoutBracket(nextBracket);
  }

  private copySavedOpeningRound(
    side: BracketSide,
    targetRound: EditableBracketRound,
    savedRound: EditableBracketRound | undefined,
    validTeamIds: Set<string>,
    teamOptions: KnockoutTeamOption[]
  ): void {
    if (!savedRound) {
      return;
    }

    targetRound.matches.forEach((match, index) => {
      const savedMatch = savedRound.matches?.[index];

      if (!savedMatch) {
        return;
      }

      match.slotTeamIds = [0, 1].map((slotIndex) => {
        const typedSlotIndex = slotIndex as 0 | 1;
        const savedTeamId = savedMatch.slotTeamIds?.[typedSlotIndex];

        if (!savedTeamId || !validTeamIds.has(savedTeamId)) {
          return match.slotTeamIds[typedSlotIndex];
        }

        const rule = OPENING_MATCH_RULES[side][index][typedSlotIndex];

        if (!rule.allowedThirdGroups?.length) {
          return match.slotTeamIds[typedSlotIndex];
        }

        const team = teamOptions.find((option) => option.id === savedTeamId);

        if (!team || team.position !== 3 || !rule.allowedThirdGroups.includes(team.group)) {
          return match.slotTeamIds[typedSlotIndex];
        }

        return savedTeamId;
      }) as [string | null, string | null];
    });
  }

  private copySavedWinners(
    targetRounds: EditableBracketRound[],
    savedRounds: EditableBracketRound[] | undefined,
    validTeamIds: Set<string>
  ): void {
    targetRounds.forEach((round, roundIndex) => {
      const savedRound = savedRounds?.[roundIndex];

      if (!savedRound) {
        return;
      }

      round.matches.forEach((match, matchIndex) => {
        const savedMatch = savedRound.matches?.[matchIndex];

        if (savedMatch?.winnerTeamId && validTeamIds.has(savedMatch.winnerTeamId)) {
          match.winnerTeamId = savedMatch.winnerTeamId;
        }
      });
    });
  }

  private copySavedFixtures(
    targetRounds: EditableBracketRound[],
    savedRounds: EditableBracketRound[] | undefined,
    validFixtureIds: Set<string>
  ): void {
    targetRounds.forEach((round, roundIndex) => {
      const savedRound = savedRounds?.[roundIndex];

      if (!savedRound) {
        return;
      }

      round.matches.forEach((match, matchIndex) => {
        const savedMatch = savedRound.matches?.[matchIndex];

        if (!savedMatch?.fixtureTeamIds) {
          return;
        }

        match.fixtureTeamIds = [
          savedMatch.fixtureTeamIds[0] && validFixtureIds.has(savedMatch.fixtureTeamIds[0]) ? savedMatch.fixtureTeamIds[0] : null,
          savedMatch.fixtureTeamIds[1] && validFixtureIds.has(savedMatch.fixtureTeamIds[1]) ? savedMatch.fixtureTeamIds[1] : null
        ];
      });
    });
  }

  private createDefaultEditableKnockoutBracket(qualifiedTeams: KnockoutTeamOption[]): EditableKnockoutBracket {
    const bracket = this.cloneEditableKnockoutBracket(EMPTY_KNOCKOUT_BRACKET);
    const seedMap = new Map(qualifiedTeams.map((team) => [team.seed, team.id]));

    (['left', 'right'] as const).forEach((side) => {
      const openingMatches = side === 'left' ? bracket.leftRounds[0].matches : bracket.rightRounds[0].matches;

      openingMatches.forEach((match, matchIndex) => {
        const rules = OPENING_MATCH_RULES[side][matchIndex];

        match.slotTeamIds = rules.map((rule) => (
          rule.allowedThirdGroups?.length ? null : (seedMap.get(rule.seed) ?? null)
        )) as [string | null, string | null];
      });
    });

    return this.recomputeEditableKnockoutBracket(bracket);
  }

  private recomputeEditableKnockoutBracket(bracket: EditableKnockoutBracket): EditableKnockoutBracket {
    const nextBracket = this.cloneEditableKnockoutBracket(bracket);
    const usedTeams = new Set<string>();
    const openingMatches = [...nextBracket.leftRounds[0].matches, ...nextBracket.rightRounds[0].matches];

    openingMatches.forEach((match) => {
      match.slotTeamIds = match.slotTeamIds.map((teamId, slotIndex) => {
        if (!teamId) {
          return null;
        }

        if (usedTeams.has(teamId) || (slotIndex === 1 && match.slotTeamIds[0] === teamId)) {
          return null;
        }

        usedTeams.add(teamId);
        return teamId;
      }) as [string | null, string | null];

      if (!match.slotTeamIds.includes(match.winnerTeamId)) {
        match.winnerTeamId = null;
      }
    });

    this.populateNextRounds(nextBracket.leftRounds);
    this.populateNextRounds(nextBracket.rightRounds);

    nextBracket.finalRound.match.slotTeamIds = [
      nextBracket.leftRounds[nextBracket.leftRounds.length - 1].matches[0].winnerTeamId,
      nextBracket.rightRounds[nextBracket.rightRounds.length - 1].matches[0].winnerTeamId
    ];

    if (!nextBracket.finalRound.match.slotTeamIds.includes(nextBracket.finalRound.match.winnerTeamId)) {
      nextBracket.finalRound.match.winnerTeamId = null;
    }

    return nextBracket;
  }

  private populateNextRounds(rounds: EditableBracketRound[]): void {
    for (let roundIndex = 1; roundIndex < rounds.length; roundIndex += 1) {
      const previousRound = rounds[roundIndex - 1];
      const currentRound = rounds[roundIndex];

      currentRound.matches.forEach((match, matchIndex) => {
        const firstSource = previousRound.matches[matchIndex * 2];
        const secondSource = previousRound.matches[(matchIndex * 2) + 1];

        match.slotTeamIds = [
          firstSource?.winnerTeamId ?? null,
          secondSource?.winnerTeamId ?? null
        ];

        if (!match.slotTeamIds.includes(match.winnerTeamId)) {
          match.winnerTeamId = null;
        }
      });
    }
  }

  private cloneEditableKnockoutBracket(bracket: EditableKnockoutBracket): EditableKnockoutBracket {
    return {
      leftRounds: bracket.leftRounds.map((round) => ({
        ...round,
        matches: round.matches.map((match) => ({
          ...match,
          slotTeamIds: [...match.slotTeamIds] as [string | null, string | null],
          fixtureTeamIds: [...match.fixtureTeamIds] as [string | null, string | null]
        }))
      })),
      rightRounds: bracket.rightRounds.map((round) => ({
        ...round,
        matches: round.matches.map((match) => ({
          ...match,
          slotTeamIds: [...match.slotTeamIds] as [string | null, string | null],
          fixtureTeamIds: [...match.fixtureTeamIds] as [string | null, string | null]
        }))
      })),
      finalRound: {
        ...bracket.finalRound,
        match: {
          ...bracket.finalRound.match,
          slotTeamIds: [...bracket.finalRound.match.slotTeamIds] as [string | null, string | null],
          fixtureTeamIds: [...bracket.finalRound.match.fixtureTeamIds] as [string | null, string | null]
        }
      }
    };
  }

  private clearAssignedOpeningTeam(
    bracket: EditableKnockoutBracket,
    teamId: string | null,
    matchId: string,
    slotIndex: 0 | 1
  ): void {
    if (!teamId) {
      return;
    }

    [...bracket.leftRounds[0].matches, ...bracket.rightRounds[0].matches].forEach((match) => {
      match.slotTeamIds = match.slotTeamIds.map((assignedTeamId, currentSlotIndex) => {
        if (assignedTeamId !== teamId) {
          return assignedTeamId;
        }

        if (match.id === matchId && currentSlotIndex === slotIndex) {
          return assignedTeamId;
        }

        return null;
      }) as [string | null, string | null];
    });
  }

  private getEditableRoundCollection(bracket: EditableKnockoutBracket, side: BracketSide): EditableBracketRound[] {
    return side === 'left' ? bracket.leftRounds : bracket.rightRounds;
  }

  private getOpeningMatchIndex(side: BracketSide, matchId: string): number {
    const matches = side === 'left' ? this.editableKnockoutBracket.leftRounds[0].matches : this.editableKnockoutBracket.rightRounds[0].matches;
    return matches.findIndex((match) => match.id === matchId);
  }

  private parseImportedGroupStandings(rawContent: string): EditableGroupStanding[] {
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawContent);
    } catch {
      throw new Error('El archivo no es un JSON valido.');
    }

    const importedStandings = Array.isArray(parsed)
      ? parsed
      : (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { groupStandings?: unknown[] }).groupStandings)
        ? (parsed as { groupStandings: unknown[] }).groupStandings
        : null);

    if (!importedStandings) {
      throw new Error('El archivo debe contener un arreglo de standings.');
    }

    const normalizedStandings = importedStandings.map((standing, index) => this.normalizeImportedStanding(standing, index));
    const documentIds = new Set<string>();

    normalizedStandings.forEach((standing) => {
      const documentId = `${standing.group}-${standing.flag}`;

      if (documentIds.has(documentId)) {
        throw new Error(`El archivo tiene un registro duplicado para ${documentId}.`);
      }

      documentIds.add(documentId);
    });

    return normalizedStandings;
  }

  private normalizeImportedStanding(standing: unknown, index: number): EditableGroupStanding {
    if (!standing || typeof standing !== 'object') {
      throw new Error(`El registro ${index + 1} no tiene un formato valido.`);
    }

    const candidate = standing as Partial<GroupStanding>;
    const group = String(candidate.group ?? '').trim().toUpperCase();
    const team = String(candidate.team ?? '').trim();
    const flag = String(candidate.flag ?? '').trim().toUpperCase();

    if (!group || !team || !flag) {
      throw new Error(`El registro ${index + 1} debe incluir group, team y flag.`);
    }

    return {
      group,
      team,
      flag,
      playerName: typeof candidate.playerName === 'string' ? candidate.playerName.trim() : '',
      playerColor: typeof candidate.playerColor === 'string' && candidate.playerColor.trim()
        ? candidate.playerColor.trim()
        : DEFAULT_PLAYER_COLOR,
      G: this.toNonNegativeInteger(candidate.G),
      E: this.toNonNegativeInteger(candidate.E),
      P: this.toNonNegativeInteger(candidate.P),
      GF: this.toNonNegativeInteger(candidate.GF),
      GC: this.toNonNegativeInteger(candidate.GC)
    };
  }

  private toNonNegativeInteger(value: unknown): number {
    const parsed = Number(value);

    if (Number.isNaN(parsed)) {
      return 0;
    }

    return Math.max(0, Math.trunc(parsed));
  }

  private buildParticipantsFromStandings(standings: GroupStanding[]): Participant[] {
    const participantMap = new Map<string, Participant>();

    standings.forEach((standing) => {
      const participantName = standing.playerName || 'Sin nombre';
      const participantColor = this.getPlayerColor(participantName);
      const key = participantName;

      if (!participantMap.has(key)) {
        participantMap.set(key, {
          name: participantName,
          color: participantColor,
          selections: []
        });
      }

      participantMap.get(key)!.selections.push({
        team: standing.team,
        flag: standing.flag,
        group: standing.group
      });
    });

    return Array.from(participantMap.values())
      .map((participant) => ({
        ...participant,
        selections: participant.selections.sort((left, right) => {
          const groupCompare = (left.group ?? '').localeCompare(right.group ?? '', 'es');
          return groupCompare !== 0 ? groupCompare : left.team.localeCompare(right.team, 'es');
        })
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'es'));
  }

  private buildWorldCupGroups(standings: GroupStanding[]): WorldCupGroup[] {
    const groupMap = new Map<string, GroupSelection[]>();

    standings.forEach((standing) => {
      const groupKey = standing.group.toUpperCase();
      const participantName = standing.playerName || 'Sin nombre';
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, []);
      }

      groupMap.get(groupKey)!.push({
        team: standing.team,
        flag: standing.flag,
        participantName,
        participantColor: this.getPlayerColor(participantName)
      });
    });

    const predictionsByGroup = new Map<string, GroupPrediction[]>();
    standings.forEach((standing) => {
      const key = standing.group.toUpperCase();
      const participantName = standing.playerName || 'Sin nombre';

      if (!predictionsByGroup.has(key)) {
        predictionsByGroup.set(key, []);
      }

      predictionsByGroup.get(key)!.push({
        participantName,
        participantColor: this.getPlayerColor(participantName),
        G: standing.G,
        E: standing.E,
        P: standing.P,
        GF: standing.GF,
        GC: standing.GC,
        DG: standing.DG,
        PTS: standing.PTS,
        PJ: standing.PJ
      });
    });

    predictionsByGroup.forEach((predictions) => {
      predictions.sort(
        (left, right) => right.PTS - left.PTS || right.DG - left.DG || right.GF - left.GF || left.participantName.localeCompare(right.participantName, 'es')
      );
    });

    return Array.from(groupMap.entries())
      .map(([group, teams]) => ({
        group,
        teams: teams.sort((a, b) => a.team.localeCompare(b.team, 'es')),
        predictions: predictionsByGroup.get(group) ?? []
      }))
      .sort((a, b) => a.group.localeCompare(b.group, 'es'));
  }

  private buildThirdPlaceRows(groups: WorldCupGroup[]): ThirdPlaceRow[] {
    return groups
      .map((group) => {
        const thirdPlace = group.predictions[2];

        if (!thirdPlace) {
          return null;
        }

        return {
          group: group.group,
          ...thirdPlace
        } satisfies ThirdPlaceRow;
      })
      .filter((row): row is ThirdPlaceRow => Boolean(row))
      .sort((left, right) =>
        right.PTS - left.PTS ||
        right.DG - left.DG ||
        right.GF - left.GF ||
        left.GC - right.GC ||
        left.participantName.localeCompare(right.participantName, 'es')
      );
  }

  private normalizeMilestones(milestones?: Partial<Record<ProgressKey, number>>): Record<ProgressKey, number> {
    return {
      groupWin: this.clampGroupWins(milestones?.groupWin ?? 0),
      round32: this.toBinary(milestones?.round32 ?? 0),
      round16: this.toBinary(milestones?.round16 ?? 0),
      round8: this.toBinary(milestones?.round8 ?? 0),
      quarterFinal: this.toBinary(milestones?.quarterFinal ?? 0),
      semiFinal: this.toBinary(milestones?.semiFinal ?? 0),
      final: this.toBinary(milestones?.final ?? 0),
      champion: this.toBinary(milestones?.champion ?? 0)
    };
  }

  private toBinary(value: number): number {
    return value > 0 ? 1 : 0;
  }

  private clampGroupWins(value: number): number {
    if (Number.isNaN(value)) {
      return 0;
    }

    return Math.min(3, Math.max(0, Math.trunc(value)));
  }

  private createPlayerColorMap(players: PlayerColor[]): Map<string, string> {
    return new Map(players.map((player) => [this.normalizePlayerName(player.name), player.color]));
  }

  private getPlayerColor(playerName: string): string {
    return this.playerColorMap.get(this.normalizePlayerName(playerName)) ?? DEFAULT_PLAYER_COLOR;
  }

  private normalizePlayerName(name: string): string {
    return name
      .trim()
      .toLocaleLowerCase('es')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '');
  }

  private downloadJsonFile(filename: string, data: unknown): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  private async seedFirebaseData(): Promise<void> {
    try {
      await Promise.all([
        //seedGroupStandingsIfEmpty(groupStandings),
        //seedTeamResultsIfEmpty(teamResultsData),
        seedScoringRulesIfMissing(scoringRulesData)
      ]);
      this.statusMessage = 'Firebase inicializado correctamente.';
    } catch (error) {
      console.error('Error cargando datos iniciales en Firebase:', error);
      this.statusMessage = 'Fallo la carga inicial en Firebase.';
    }
  }
}

