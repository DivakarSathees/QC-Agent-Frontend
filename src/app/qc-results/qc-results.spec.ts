import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QcResults } from './qc-results';

describe('QcResults', () => {
  let component: QcResults;
  let fixture: ComponentFixture<QcResults>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QcResults]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QcResults);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
