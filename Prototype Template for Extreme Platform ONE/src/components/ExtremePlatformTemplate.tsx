import { useState, useEffect } from 'react';
import GeneralLayoutTemplateNavClosed from '../imports/GeneralLayoutTemplateNavClosed';
import GeneralLayoutTemplateNavOpen from '../imports/GeneralLayoutTemplateNavOpen';

export default function ExtremePlatformTemplate() {
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  // Detect screen size and set breakpoint states
  useEffect(() => {
    const checkScreenSize = () => {
      const width = window.innerWidth;
      setIsMobile(width < 744); // Below M breakpoint
      setIsTablet(width >= 744 && width < 1024); // M breakpoint
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // Auto-close nav on mobile when switching from larger screen
  useEffect(() => {
    if (isMobile && isNavOpen) {
      setIsNavOpen(false);
    }
  }, [isMobile]);

  const toggleNav = () => {
    setIsNavOpen(!isNavOpen);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    // Close nav when clicking backdrop on mobile/tablet
    if ((isMobile || isTablet) && isNavOpen) {
      const target = e.target as HTMLElement;
      if (target.classList.contains('mobile-nav-backdrop')) {
        setIsNavOpen(false);
      }
    }
  };

  const handleNavClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Toggle menu on hamburger click
    if (target.closest('[data-name="Control Button"]') || target.closest('[data-name="menu"]')) {
      toggleNav();
      return;
    }
    
    // Auto-close nav on mobile when clicking navigation items
    if (isMobile && isNavOpen) {
      const isNavItem = target.closest('[data-name="Navigation Item"]') || 
                       target.closest('[data-name="Nav Item"]');
      if (isNavItem) {
        setIsNavOpen(false);
      }
    }
  };

  return (
    <>
      {/* Mobile/Tablet backdrop overlay */}
      {(isMobile || isTablet) && isNavOpen && (
        <div 
          className="mobile-nav-backdrop"
          onClick={handleBackdropClick}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(30, 31, 42, 0.7)',
            backdropFilter: 'blur(4px)',
            zIndex: 40,
          }}
        />
      )}
      
      <div 
        className="responsive-template-wrapper overflow-hidden w-full max-w-full"
        onClick={handleNavClick}
      >
        {isNavOpen ? (
          <GeneralLayoutTemplateNavOpen />
        ) : (
          <GeneralLayoutTemplateNavClosed />
        )}
      </div>
    </>
  );
}