// Inner Joyride mount split out so the heavy react-joyride bundle and
// the OnboardingTour CSS only load for AGENT sessions actually running
// a tour. PageTour gates the lazy import behind shouldRun, then renders
// this component once the kill-switch / completed-flag / mobile checks
// have all passed.
import { Joyride, STATUS, ACTIONS } from 'react-joyride';
import { killAllTours } from '../lib/tourKill';
import { tourStyles, floaterProps, TourTooltip } from './OnboardingTour';

export default function PageTourInner({ steps }) {
  const handleCallback = ({ status, action }) => {
    if (
      action === ACTIONS.CLOSE ||
      action === ACTIONS.SKIP ||
      status === STATUS.FINISHED ||
      status === STATUS.SKIPPED
    ) killAllTours();
  };

  return (
    <Joyride
      run={true}
      steps={steps.map((s) => ({ disableBeacon: true, placement: 'auto', ...s }))}
      continuous
      showProgress={steps.length > 1}
      showSkipButton
      hideCloseButton
      scrollToFirstStep={false}
      disableScrolling={false}
      disableOverlayClose
      tooltipComponent={TourTooltip}
      locale={{ back: 'הקודם', last: 'סיימתי', next: 'הבא', skip: 'דלג על הסיור' }}
      callback={handleCallback}
      styles={tourStyles}
      floaterProps={floaterProps}
    />
  );
}
