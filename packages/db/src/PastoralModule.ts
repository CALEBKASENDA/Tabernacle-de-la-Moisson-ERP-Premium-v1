import type { AppDatabase } from './database/appDatabase';
import type { TenantContext } from './tenantContext';
import { MemberRepository } from './repositories/memberRepository';
import { CellRepository } from './repositories/cellRepository';
import { VisitRepository } from './repositories/visitRepository';
import { TrainingRepository } from './repositories/trainingRepository';

export class PastoralModule {
  readonly members: MemberRepository;
  readonly cells: CellRepository;
  readonly visits: VisitRepository;
  readonly trainings: TrainingRepository;

  constructor(private readonly db: AppDatabase) {
    this.members = new MemberRepository(db);
    this.cells = new CellRepository(db);
    this.visits = new VisitRepository(db);
    this.trainings = new TrainingRepository(db);
  }

  static bootstrap(db: AppDatabase): PastoralModule {
    return new PastoralModule(db);
  }

  getDashboard(ctx: TenantContext) {
    const totalMembers = this.members.countActive(ctx);
    const recentMembers = this.members.list(ctx).slice(0, 5);
    const cells = this.cells.list(ctx).length;
    const visitsThisMonth = this.visits.list(ctx, {
      dateFrom: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    }).length;
    const upcomingTrainings = this.trainings
      .list(ctx)
      .filter((t) => t.training_date >= new Date().toISOString().slice(0, 10))
      .slice(0, 5);
    return { totalMembers, recentMembers, cellsCount: cells, visitsThisMonth, upcomingTrainings };
  }
}
