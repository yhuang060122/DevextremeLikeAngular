import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

/** localStorage 里存放允许查看日志面板的角色，逗号分隔 */
export const LOG_VIEWER_ROLES_KEY = 'app.logs.allowed-roles';

/**
 * 日志面板路由守卫。
 *
 * 实现说明：
 * - 这是“样板级”守卫：角色从 localStorage 读取，未配置时默认放行（方便开发期直接访问）；
 * - 生产环境请把它替换为真实鉴权：注入你自己的 AuthService，
 *   例如 `return this.auth.hasRole('LogViewer') || this.auth.hasRole('Admin')`；
 * - 后端 LogQueryController 已带 [Authorize(Roles = "LogViewer,Admin")]，
 *   前端守卫只是 UX 层面的提示，真正的权限边界永远在后端。
 */
export const logViewerGuard: CanActivateFn = () => {
  const router = inject(Router);
  const raw = localStorage.getItem(LOG_VIEWER_ROLES_KEY);

  // 未配置：开发环境默认放行
  if (!raw) return true;

  const roles = raw.split(',').map((r) => r.trim());
  const allowed = roles.includes('LogViewer') || roles.includes('Admin');
  if (!allowed) {
    void router.navigateByUrl('/');
    return false;
  }
  return true;
};
