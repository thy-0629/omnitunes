import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SourceAttribution } from './SourceAttribution';

describe('SourceAttribution', () => {
  it('renders a keyboard-accessible, safe external license link for attributed sources', () => {
    render(
      <SourceAttribution
        attribution={{
          license: 'CC BY 4.0',
          licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
          sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.ogg',
          creator: 'Example creator',
        }}
      />,
    );

    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute(
      'href',
      'https://commons.wikimedia.org/wiki/File:Example.ogg',
    );
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('rel', 'noreferrer');
  });

  it('renders nothing without attribution metadata', () => {
    const { container } = render(<SourceAttribution attribution={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
