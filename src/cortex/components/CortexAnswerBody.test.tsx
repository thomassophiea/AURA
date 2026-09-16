/**
 * The answer rendered as a document.
 *
 * The fixture is the REAL answer an operator pasted back, verbatim: a healthy
 * client reported in one grey paragraph, with literal `**` asterisks, the
 * evidence list collapsed inline, and an injection notice as the first thing
 * the reader saw.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CortexAnswerBody, parseAnswer } from './CortexAnswerBody';

const REAL_ANSWER = [
  'Client 5A:DA:D9:17:55:71 is healthy — connected, has an IP, and no problems detected.',
  '',
  '**Evidence:** - Associated to AP5020-PVT-03_MESH_ROOT (PrimarySite) on the "Skynet" WLAN, channel 149/40, WPA2-PSK, role "Enterprise User". - Signal strength (RSS) is -61 dBm, in line with its own baseline median of -59 dBm — no coverage issue. - Holds IP 192.168.100.212 via DHCP — layer-2 and layer-3 both fine.',
  '',
  '**Confidence:** The runtime flags this as "insufficient evidence" for any cause.',
  '',
  '**Action:** None needed.',
].join('\n');

describe('parseAnswer', () => {
  it('treats the first sentence as the verdict', () => {
    const blocks = parseAnswer(REAL_ANSWER);
    expect(blocks[0]).toMatchObject({ kind: 'lead' });
    expect(blocks[0].kind === 'lead' && blocks[0].text).toMatch(/is healthy/);
  });

  it('turns an inline "- " run into real bullets', () => {
    // This is the defect: the model wrote the evidence list on one line after
    // the label, so it rendered as a single paragraph of semicolon-joined text.
    const blocks = parseAnswer(REAL_ANSWER);
    const bullets = blocks.find((b) => b.kind === 'bullets');
    expect(bullets).toBeDefined();
    expect(bullets!.kind === 'bullets' && bullets!.items).toHaveLength(3);
  });

  it('lifts **Label:** into a heading', () => {
    const headings = parseAnswer(REAL_ANSWER)
      .filter((b) => b.kind === 'heading')
      .map((b) => (b.kind === 'heading' ? b.text : ''));
    expect(headings).toEqual(expect.arrayContaining(['Evidence', 'Confidence', 'Action']));
  });

  it('is empty for empty input rather than rendering a stray block', () => {
    expect(parseAnswer('')).toEqual([]);
    expect(parseAnswer('   ')).toEqual([]);
  });
});

describe('CortexAnswerBody', () => {
  it('leaves no literal asterisks on screen', () => {
    // The whole visible symptom. `**Evidence:**` reached the operator as four
    // punctuation marks because the content was rendered as plain text.
    const { container } = render(<CortexAnswerBody text={REAL_ANSWER} />);
    expect(container.textContent).not.toMatch(/\*\*/);
    expect(screen.getByText('Evidence')).toBeInTheDocument();
  });

  it('renders inline bold as emphasis, not as characters', () => {
    const { container } = render(<CortexAnswerBody text={'Lead line.\n\nThe AP is **InService** now.'} />);
    expect(container.querySelector('strong')?.textContent).toBe('InService');
    expect(container.textContent).not.toContain('**');
  });

  it('does not render HTML from network-sourced text', () => {
    // An SSID or hostname can contain anything. A markdown library would also
    // accept raw HTML here; this renderer puts it through React as text.
    const { container } = render(
      <CortexAnswerBody text={'Lead.\n\n- SSID <img src=x onerror=alert(1)> reported'} />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('renders a real bullet list as list items', () => {
    const { container } = render(<CortexAnswerBody text={'Lead.\n\n- one\n- two'} />);
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });
});
