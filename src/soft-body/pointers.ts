type PointerCapture = Pick<HTMLElement,'setPointerCapture'|'hasPointerCapture'|'releasePointerCapture'>;

/** Independent pointer records with bounded capture and safe cancellation. */
export class CapturedPointers<T extends object> {
  private readonly records=new Map<number,T>();
  constructor(private readonly target:PointerCapture, private readonly limit:number) {}

  get size() { return this.records.size; }
  has(id:number) { return this.records.has(id); }
  get(id:number) { return this.records.get(id); }
  values() { return this.records.values(); }

  begin(id:number, record:T) {
    if(this.records.has(id) || this.records.size>=this.limit) return false;
    this.records.set(id,record);
    try { this.target.setPointerCapture(id); }
    catch { this.records.delete(id);return false; }
    return true;
  }

  end(id:number) {
    const record=this.records.get(id);
    if(!record) return;
    // Capture release can dispatch lostpointercapture. Remove the record first,
    // so that event cannot end the same contact twice or touch another finger.
    this.records.delete(id);
    if(this.target.hasPointerCapture(id)) this.target.releasePointerCapture(id);
    return record;
  }

  clear() {
    const ids=[...this.records.keys()];
    this.records.clear();
    for(const id of ids) if(this.target.hasPointerCapture(id)) this.target.releasePointerCapture(id);
  }
}
