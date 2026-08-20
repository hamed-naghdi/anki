import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { SidebarModule } from 'primeng/sidebar';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { Home } from '@primeicons/angular/home';
import { Inbox } from '@primeicons/angular/inbox';
import { Search } from '@primeicons/angular/search';
import { Bell } from '@primeicons/angular/bell';
import { ChartBar } from '@primeicons/angular/chart-bar';
import { ChevronDown } from '@primeicons/angular/chevron-down';
import { Users } from '@primeicons/angular/users';
import { Calendar } from '@primeicons/angular/calendar';
import { Cog } from '@primeicons/angular/cog';
import { Sidebar } from '@primeicons/angular/sidebar';

@Component({
  imports: [
    FormsModule,
    SidebarModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    IconFieldModule,
    InputIconModule,
    Home,
    Inbox,
    Search,
    Bell,
    ChartBar,
    ChevronDown,
    Users,
    Calendar,
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

  // Top toolbar: search box + deck/note-type pickers + settings. Mock options for now -
  // backed by the real Anki deck/note-type list once that's wired to AnkiConnect.
  searchTerm = signal('');
  decks = ['Vocab::EN', 'Vocab::Academic', 'Vocab::Phrases'];
  selectedDeck = signal(this.decks[0]);
  noteTypes = ['Vocab + Ex', 'Basic'];
  selectedNoteType = signal(this.noteTypes[0]);
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
