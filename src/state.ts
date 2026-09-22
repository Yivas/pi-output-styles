export class SelectionState {
  private selectedId: string | undefined;

  constructor(initialSelection?: string) {
    this.selectedId = initialSelection;
  }

  getSelected(): string | undefined {
    return this.selectedId;
  }

  setSelected(styleId: string): void {
    this.selectedId = styleId;
  }
}
