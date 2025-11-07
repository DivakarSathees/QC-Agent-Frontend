import { Component, OnDestroy, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { Qc, QCEvent } from './services/qc';
import { Subscription } from 'rxjs';
import { CommonModule, JsonPipe } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet,
    CommonModule,         // ✅ Enables *ngIf, *ngFor, etc.
    ReactiveFormsModule,  // ✅ Enables [formGroup] binding
    JsonPipe
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnDestroy {
  protected readonly title = signal('angularapp');

  form: FormGroup;
  zipFile: File | null = null;
  events: QCEvent[] = [];
  qcResult: any = null;
  dockerResult: any = null;
  completedDescription: string | null = null;
  sending = false;
  error: string | null = null;
  private sub: Subscription | null = null;

  constructor(private fb: FormBuilder, private qc: Qc) {
    this.form = this.fb.group({
      description: ['', Validators.required],
      config: [JSON.stringify({ /* default config here */ }), Validators.required],
    });
  }

  onFileChange(ev: Event) {
    const input = ev.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.zipFile = input.files[0];
    } else {
      this.zipFile = null;
    }
  }

  start() {
    if (this.form.invalid) {
      this.error = 'Please fill required fields.';
      return;
    }
    this.error = null;
    this.events = [];
    this.qcResult = null;
    this.dockerResult = null;
    this.completedDescription = null;

    const description = this.form.value.description;
    const config = JSON.parse(this.form.value.config || '{}');

    this.sending = true;

    // subscribe to streaming events
    this.sub = this.qc.startFullRun(description, this.zipFile, config).subscribe({

      next: (evt) => this.handleEvent(evt),
      error: (err) => {
        this.error = String(err);
        this.sending = false;
      },
      complete: () => {
        this.sending = false;
      },
    });
  }

  private handleEvent(evt: QCEvent) {
    console.log('Received event:', evt);
    
    this.events.push(evt);

    // handle by stage presence
    if (evt.stage === 'qc_completed' && evt.qc_results) {
      this.qcResult = evt.qc_results;

      // Attempt to pick corrected_description if present
      if (evt.qc_results.completeness?.remarks === undefined && evt.qc_results.corrections) {
        // ignore
      }
      // corrected_description could be nested in qc_results.corrections.corrected_description
      const cd =
        evt.qc_results.corrections?.corrected_description ||
        evt.qc_results.corrected_description ||
        evt.qc_results.corrections?.corrected_description ||
        evt.qc_results.completeness?.remarks; // fallback
      if (cd) this.completedDescription = cd;
      // also check corrections.corrected_description as in your sample
      if (evt.qc_results.corrections?.corrected_description) {
        this.completedDescription = evt.qc_results.corrections.corrected_description;
      }
    }

    if (evt.stage === 'docker_completed' && evt.docker_results) {
      this.dockerResult = evt.docker_results;
      // docker logs or run_result.output can include step logs
    }

    // If the server emits full final "status":"completed" object
    if (evt.status === 'completed') {
      // nothing extra; stream will complete soon
    }

    // If server emits object with nested docker_results or qc_results without stage:
    if (!evt.stage) {
      if (evt.qc_results) this.qcResult = evt.qc_results;
      if (evt.docker_results) this.dockerResult = evt.docker_results;
    }
  }

  ngOnDestroy(): void {
    if (this.sub) this.sub.unsubscribe();
  }
    expandedSections: Record<string, boolean> = {};

  toggleSection(key: string): void {
    this.expandedSections[key] = !this.expandedSections[key];
  }

  isExpanded(key: string): boolean {
    return this.expandedSections[key];
  }

  formatKey(key: string): string {
    return key.replace(/_/g, ' ').toUpperCase();
  }

  // If you are looping over an object (not array) in template
  getObjectEntries(obj: Record<string, any>): { key: string; value: any }[] {
    return Object.entries(obj).map(([key, value]) => ({ key, value }));
  }


}
