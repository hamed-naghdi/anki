import { Component, inject, linkedSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Clone } from '@primeicons/angular/clone';
import { Home } from '@primeicons/angular/home';
import { Sidebar as SidebarIcon } from '@primeicons/angular/sidebar';
import { ButtonDirective } from 'primeng/button';
import { SidebarModule } from 'primeng/sidebar';
import { filter, map } from 'rxjs';
import { mediaQuery } from '../core/browser/media-query';

/** App chrome: the navigation sidebar (off-canvas on small screens) and the page header. */
@Component({
  selector: 'app-shell',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    SidebarModule,
    ButtonDirective,
    Clone,
    Home,
    SidebarIcon,
  ],
  templateUrl: './shell.html',
})
export class Shell {
  private readonly router = inject(Router);

  protected readonly isMobile = mediaQuery('(max-width: 1023px)');
  /** Open by default on desktop, closed on mobile - reset whenever the breakpoint is crossed. */
  protected readonly navOpen = linkedSignal(() => !this.isMobile());

  protected readonly pageTitle = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => {
        let route = this.router.routerState.snapshot.root;
        while (route.firstChild) {
          route = route.firstChild;
        }
        return route.title ?? '';
      }),
    ),
    { initialValue: '' },
  );
}
