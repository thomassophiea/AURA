import { describe, it, expect, beforeAll, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog';

beforeAll(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => undefined;
  }
});

describe('AlertDialog primitives', () => {
  it('renders nothing when closed', () => {
    render(
      <AlertDialog open={false}>
        <AlertDialogTrigger>Open</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm?</AlertDialogTitle>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
    );
    expect(screen.queryByText('Confirm?')).toBeNull();
  });

  it('renders title + description + action + cancel when open', () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
    expect(screen.getByText('Delete this?')).toBeTruthy();
    expect(screen.getByText('This cannot be undone.')).toBeTruthy();
    expect(screen.getByText('Cancel')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('header/footer/title/description data-slots present', () => {
    const { baseElement } = render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>X</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
    expect(baseElement.querySelector('[data-slot="alert-dialog-content"]')).toBeTruthy();
    expect(baseElement.querySelector('[data-slot="alert-dialog-header"]')).toBeTruthy();
    expect(baseElement.querySelector('[data-slot="alert-dialog-footer"]')).toBeTruthy();
    expect(baseElement.querySelector('[data-slot="alert-dialog-title"]')).toBeTruthy();
    expect(baseElement.querySelector('[data-slot="alert-dialog-description"]')).toBeTruthy();
  });

  it('AlertDialogAction click fires onClick', () => {
    const onClick = vi.fn();
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>X</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={onClick}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
    fireEvent.click(screen.getByText('Confirm'));
    expect(onClick).toHaveBeenCalled();
  });

  it('AlertDialogCancel uses the outline button variant class', () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>X</AlertDialogTitle>
            <AlertDialogDescription>d</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Nope</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
    const cancel = screen.getByText('Nope') as HTMLButtonElement;
    expect(cancel.className).toContain('border');
  });
});
