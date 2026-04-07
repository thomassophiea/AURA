import { usePersonaContext } from '@/contexts/PersonaContext';
import { PERSONA_DEFINITIONS, PERSONA_GROUPS, type PersonaId } from '@/config/personaDefinitions';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserCog } from 'lucide-react';

export function PersonaSelector() {
  const { activePersona, setActivePersona } = usePersonaContext();

  const groupedPersonas = PERSONA_GROUPS.map(group => ({
    group,
    personas: PERSONA_DEFINITIONS.filter(p => p.group === group),
  }));

  return (
    <Select value={activePersona} onValueChange={(v: string) => setActivePersona(v as PersonaId)}>
      <SelectTrigger
        size="sm"
        className="w-[180px] bg-transparent border-primary/30 text-primary hover:bg-primary/10 text-xs"
      >
        <UserCog className="h-3.5 w-3.5 shrink-0" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="w-[260px]">
        {groupedPersonas.map(({ group, personas }, gi) => (
          <div key={group}>
            {gi > 0 && <SelectSeparator />}
            <SelectGroup>
              {group !== 'Super User' && (
                <SelectLabel>{group}</SelectLabel>
              )}
              {personas.map(persona => (
                <SelectItem key={persona.id} value={persona.id}>
                  <div className="flex flex-col">
                    <span>{persona.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">
                      {persona.description}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          </div>
        ))}
      </SelectContent>
    </Select>
  );
}
