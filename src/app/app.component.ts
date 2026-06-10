import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ChipModule } from 'primeng/chip';
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { TabViewModule } from 'primeng/tabview';
import { TableModule } from 'primeng/table';
import { ADMIN_PASSWORD } from './admin-config';
import groupStandings from '../assets/data/group-standings.json';
import scoringRulesData from '../assets/data/scoring-rules.json';
import teamResultsData from '../assets/data/team-results.json';
import {
  getGroupStandings,
  getScoringRules,
  getTeamResults,
  saveGroupStanding,
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

type Participant = {
  name: string;
  color: string;
  selections: TeamSelection[];
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

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, CardModule, ChipModule, DividerModule, TabViewModule, TableModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
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

      const [results, scoring, standings] = await Promise.all([
        this.loadFirebaseTeamResults(),
        this.loadFirebaseScoringRules(),
        this.loadFirebaseGroupStandings()
      ]);

      this.groupStandings = this.normalizeStandings(standings);
      this.standingsGroups = this.getStandingGroups(this.groupStandings);
      this.participants = this.buildParticipantsFromStandings(this.groupStandings);
      this.worldCupGroups = this.buildWorldCupGroups(this.groupStandings);
      this.scoringRules = scoring;
      this.stageDefinitions = scoring.stages;
      this.editableResults = this.normalizeResults(results);
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
    const blob = new Blob([JSON.stringify(this.editableResults, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'team-results.json';
    anchor.click();
    URL.revokeObjectURL(url);
    this.statusMessage = 'JSON listo para descargar.';
  }

  downloadGroupStandings(): void {
    const blob = new Blob([JSON.stringify(this.serializeGroupStandings(this.groupStandings), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'group-standings.json';
    anchor.click();
    URL.revokeObjectURL(url);
    this.statusMessage = 'Group standings listo para descargar.';
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

  private async reloadOriginalResults(): Promise<void> {
    const results = await this.loadFirebaseTeamResults();
    this.editableResults = this.normalizeResults(results);
    this.recalculateSummaries();
    this.statusMessage = 'Se recargo teamResults desde Firebase.';
  }

  private async reloadOriginalGroupStandings(): Promise<void> {
    const standings = await this.loadFirebaseGroupStandings();
    this.groupStandings = this.normalizeStandings(standings);
    this.standingsGroups = this.getStandingGroups(this.groupStandings);
    this.participants = this.buildParticipantsFromStandings(this.groupStandings);
    this.worldCupGroups = this.buildWorldCupGroups(this.groupStandings);
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

      const totalPoints = selections.reduce((sum, selection) => sum + selection.points, 0);

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

  private serializeGroupStandings(standings: GroupStanding[]): Array<Omit<GroupStanding, 'DG' | 'PTS' | 'PJ'>> {
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

  private buildParticipantsFromStandings(standings: GroupStanding[]): Participant[] {
    const participantMap = new Map<string, Participant>();

    standings.forEach((standing) => {
      const participantName = standing.playerName || 'Sin nombre';
      const participantColor = standing.playerColor || '#64748b';
      const key = `${participantName}__${participantColor}`;

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
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, []);
      }

      groupMap.get(groupKey)!.push({
        team: standing.team,
        flag: standing.flag,
        participantName: standing.playerName || 'Sin nombre',
        participantColor: standing.playerColor || '#64748b'
      });
    });

    const predictionsByGroup = new Map<string, GroupPrediction[]>();
    standings.forEach((standing) => {
      const key = standing.group.toUpperCase();

      if (!predictionsByGroup.has(key)) {
        predictionsByGroup.set(key, []);
      }

      predictionsByGroup.get(key)!.push({
        participantName: standing.playerName || 'Sin nombre',
        participantColor: standing.playerColor || '#64748b',
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

  private async seedFirebaseData(): Promise<void> {
    try {
      await Promise.all([
        seedGroupStandingsIfEmpty(groupStandings),
        seedTeamResultsIfEmpty(teamResultsData),
        seedScoringRulesIfMissing(scoringRulesData)
      ]);
      this.statusMessage = 'Firebase inicializado correctamente.';
    } catch (error) {
      console.error('Error cargando datos iniciales en Firebase:', error);
      this.statusMessage = 'Fallo la carga inicial en Firebase.';
    }
  }
}

