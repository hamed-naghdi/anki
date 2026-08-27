import { Component, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { SidebarModule } from 'primeng/sidebar';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { Clone } from '@primeicons/angular/clone';
import { Home } from '@primeicons/angular/home';
import { Search } from '@primeicons/angular/search';
import { Bell } from '@primeicons/angular/bell';
import { Cog } from '@primeicons/angular/cog';
import { Sidebar } from '@primeicons/angular/sidebar';

@Component({
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    FormsModule,
    SidebarModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    IconFieldModule,
    InputIconModule,
    Clone,
    Home,
    Search,
    Bell,
    Cog,
    Sidebar,
  ],
  selector: 'app-layout',
  styles: ``,
  templateUrl: './layout.html',
})
export class Layout implements OnInit {
  isMobile = signal(false);
  navOpen = signal(true);
  open = signal(false);

  private mql?: MediaQueryList;
  private mqlListener?: (e: MediaQueryListEvent) => void;
  ngOnInit() {
    if (typeof window === 'undefined') return;
    this.mql = window.matchMedia('(max-width: 1023px)');
    this.isMobile.set(this.mql.matches);
    this.navOpen.set(!this.mql.matches);
    this.mqlListener = (e) => {
      this.isMobile.set(e.matches);
      this.navOpen.set(!e.matches);
    };
    this.mql.addEventListener('change', this.mqlListener);
  }
  ngOnDestroy() {
    this.mql?.removeEventListener('change', this.mqlListener!);
  }
}
