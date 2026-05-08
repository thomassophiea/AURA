import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchFilterBar } from './SearchFilterBar';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined;
  }
});

const baseProps = {
  searchValue: '',
  onSearchChange: vi.fn(),
};

describe('SearchFilterBar', () => {
  it('renders the search input with placeholder', () => {
    render(<SearchFilterBar {...baseProps} searchPlaceholder="Find an AP..." />);
    const input = screen.getByPlaceholderText('Find an AP...') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('');
  });

  it('forwards search input value to onSearchChange', () => {
    const onSearchChange = vi.fn();
    render(<SearchFilterBar {...baseProps} onSearchChange={onSearchChange} />);
    fireEvent.change(screen.getByPlaceholderText('Search...'), {
      target: { value: 'lobby' },
    });
    expect(onSearchChange).toHaveBeenCalledWith('lobby');
  });

  it('shows the inline X clear button when searchValue is non-empty', () => {
    const onSearchChange = vi.fn();
    const { container } = render(
      <SearchFilterBar {...baseProps} searchValue="abc" onSearchChange={onSearchChange} />
    );
    // The clear button is the only <button> rendered when no other controls
    // appear; click it.
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]);
    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  it('renders the time-range select when showTimeRange + onTimePresetChange supplied', () => {
    render(
      <SearchFilterBar {...baseProps} showTimeRange timePreset="24h" onTimePresetChange={vi.fn()} />
    );
    // SelectValue placeholder + native select trigger should render
    expect(screen.getAllByText(/Last 24 hours/i).length).toBeGreaterThan(0);
  });

  it('hides the time-range select when showTimeRange=false', () => {
    render(<SearchFilterBar {...baseProps} showTimeRange={false} />);
    expect(screen.queryByText(/Last 24 hours/i)).toBeNull();
  });

  it('renders the custom date popover trigger when timePreset="custom"', () => {
    render(
      <SearchFilterBar
        {...baseProps}
        showTimeRange
        timePreset="custom"
        onTimePresetChange={vi.fn()}
      />
    );
    expect(screen.getByText('Select dates')).toBeTruthy();
  });

  it('renders the site filter when showSiteFilter+onSiteChange', () => {
    render(
      <SearchFilterBar
        {...baseProps}
        showSiteFilter
        sites={['HQ', 'EU']}
        selectedSite="all"
        onSiteChange={vi.fn()}
      />
    );
    // The trigger collapses to "All Sites" placeholder when selected="all"
    expect(screen.getAllByText(/All Sites/i).length).toBeGreaterThan(0);
  });

  it('shows the Clear button + result count when filters are active', () => {
    render(<SearchFilterBar {...baseProps} searchValue="x" resultCount={3} totalCount={10} />);
    expect(screen.getByText('Clear')).toBeTruthy();
    expect(screen.getByText('3 of 10')).toBeTruthy();
  });

  it('Clear button resets search + time + site', () => {
    const onSearchChange = vi.fn();
    const onTimePresetChange = vi.fn();
    const onSiteChange = vi.fn();
    render(
      <SearchFilterBar
        {...baseProps}
        searchValue="abc"
        onSearchChange={onSearchChange}
        showTimeRange
        timePreset="1h"
        onTimePresetChange={onTimePresetChange}
        showSiteFilter
        selectedSite="HQ"
        sites={['HQ']}
        onSiteChange={onSiteChange}
      />
    );
    fireEvent.click(screen.getByText('Clear'));
    expect(onSearchChange).toHaveBeenCalledWith('');
    expect(onTimePresetChange).toHaveBeenCalledWith('24h');
    expect(onSiteChange).toHaveBeenCalledWith('all');
  });

  it('hides the Clear button when no filters are active', () => {
    render(<SearchFilterBar {...baseProps} />);
    expect(screen.queryByText('Clear')).toBeNull();
  });

  it('forwards a custom className onto the wrapper', () => {
    const { container } = render(<SearchFilterBar {...baseProps} className="my-bar" />);
    expect((container.firstChild as HTMLElement).className).toContain('my-bar');
  });
});
