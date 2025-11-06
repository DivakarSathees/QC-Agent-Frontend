import { TestBed } from '@angular/core/testing';

import { Qc } from './qc';

describe('Qc', () => {
  let service: Qc;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Qc);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
