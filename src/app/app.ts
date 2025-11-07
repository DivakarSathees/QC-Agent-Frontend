import { Component, OnDestroy, signal } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
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
    JsonPipe,
    FormsModule
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnDestroy {
  protected readonly title = signal('angularapp');

  form: FormGroup;
  qbForm: FormGroup;
  questionBanks: any[] = [];
  questions: any[] = [];
  selectedQuestionId: string | null = null;
  fetchingQuestions = false;
  selectedForm: 'qc' | 'qb' = 'qc'; // default to QC form
  filteredQuestionBanks: any[] = [];
  uniqueCreators: string[] = [];
  selectedCreator: string = '';
  selectedQbId: string | null = null;
  zipFile: File | null = null;
  events: QCEvent[] = [];
  qcResult: any = null;
  dockerResult: any = null;
  completedDescription: string | null = null;
  sending = false;
  fetchingQBs = false;
  error: string | null = null;
  private sub: Subscription | null = null;

  constructor(private fb: FormBuilder, private qc: Qc) {
    this.form = this.fb.group({
      description: ['', Validators.required],
      config: [JSON.stringify({ /* default config here */ }), Validators.required],
    });
    this.qbForm = this.fb.group({
      authToken: ['', Validators.required],
      search: ['', Validators.required],
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

  fetchQBs() {
    const data = {
      authToken: this.qbForm.value.authToken,
      search: this.qbForm.value.search
    }
    this.fetchingQBs = true;
    this.qc.getQuestionBanks(data).subscribe({
      next: (res: any) => {
        console.log(res);
        
        this.questionBanks = res.results.questionbanks || [];
        this.filteredQuestionBanks = [...this.questionBanks]; // initially no filter
        this.extractUniqueCreators();
        this.fetchingQBs = false;
      },
      error: (err) => {
        console.error('Error fetching question banks:', err);
      }
    });
  }

  filterByCreator() {
    if (this.selectedCreator) {
      this.filteredQuestionBanks = this.questionBanks.filter(
        qb => qb.createdBy === this.selectedCreator
      );
    } else {
      this.filteredQuestionBanks = [...this.questionBanks];
    }
  }

  extractUniqueCreators() {
    const creators = this.questionBanks.map(qb => qb.createdBy).filter(Boolean);
    this.uniqueCreators = Array.from(new Set(creators));
  }

  selectQB(qb: any) {
    this.selectedQbId = qb.qb_id;
  }

  selectQuestion(question: any) {
  if (!question) return;

  this.selectedQuestionId = question.q_id; // ✅ Move selection logic here

  const description = question.question_data || '';
  const config = question.project_questions?.config
    ? JSON.stringify({ config: question.project_questions.config })
    : '';

  this.form.patchValue({
    description,
    config
  });

  console.log('Selected question loaded into QC form:', { description, config });
}


  fetchQuestionsForQB() {
    if (!this.selectedQbId) {
      alert('Please select a Question Bank first.');
      return;
    }

    const authToken = this.qbForm.value.authToken;
    this.fetchingQuestions = true;

    this.qc.getQuestionsForQB(authToken, this.selectedQbId).subscribe({
      next: (res: any) => {
        console.log('Questions for QB:', res);
        this.questions = res.non_group_questions || [];
        console.log('Fetched questions:', this.questions);
        
        this.fetchingQuestions = false;
      },
      error: (err) => {
        console.error('Error fetching questions:', err);
        this.fetchingQuestions = false;
      },
    });
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
