import * as P from "@radix-ui/react-progress";
export function Progress({value=0}:{value?:number}){return <P.Root value={value} className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-label="Export progress"><P.Indicator className="h-full bg-primary transition-transform" style={{transform:`translateX(-${100-value}%)`}}/></P.Root>}
