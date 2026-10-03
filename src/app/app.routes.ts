import { Routes } from '@angular/router';
import { SlotsDemo } from './slots-demo/slots-demo';
import { LogViewer } from './logs/log-viewer';
import { logViewerGuard } from './logs/log-viewer.guard';
import { ContextGuardDemo } from './context-guard-demo/context-guard-demo';
import { TestPage } from './test-page/test-page';

export const routes: Routes = [
  { path: '', component: SlotsDemo },
  { path: 'context-guard', component: ContextGuardDemo },
  {
    path: 'logs',
    component: LogViewer,
    canActivate: [logViewerGuard],
  },
  { path: 'test', component: TestPage },
];
