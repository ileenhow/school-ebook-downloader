export class BookSelection {
  readonly #contentIds = new Set<string>();

  get size(): number {
    return this.#contentIds.size;
  }

  has(contentId: string): boolean {
    return this.#contentIds.has(contentId);
  }

  set(contentId: string, selected: boolean): void {
    if (selected) {
      this.#contentIds.add(contentId);
    } else {
      this.#contentIds.delete(contentId);
    }
  }

  setMany(contentIds: Iterable<string>, selected: boolean): void {
    for (const contentId of contentIds) {
      this.set(contentId, selected);
    }
  }

  deleteMany(contentIds: Iterable<string>): void {
    for (const contentId of contentIds) {
      this.#contentIds.delete(contentId);
    }
  }

  retain(contentIds: Iterable<string>): void {
    const allowed = new Set(contentIds);
    for (const contentId of this.#contentIds) {
      if (!allowed.has(contentId)) {
        this.#contentIds.delete(contentId);
      }
    }
  }

  clear(): void {
    this.#contentIds.clear();
  }
}
