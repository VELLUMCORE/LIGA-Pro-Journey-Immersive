/**
 * Provides the route components for the Main Browser Window.
 *
 * @module
 */
import Calendar from './calendar';
import Competitions from './competitions';
import Dashboard from './dashboard';
import Inbox from './inbox';
import Players from './players';
import Squad from './squad';
import Teams from './teams';
import Faceit from "./faceit/faceit";
import FaceitDetailedStatistics from "./faceit/detailed-statistics";
import FaceitRankings from "./faceit/rankings";

/**
 * Exports this module.
 *
 * @exports
 */
export default {
  // standalone routes
  Calendar,
  Dashboard,
  Inbox,
  Players,
  Squad,
  Faceit,
  FaceitDetailedStatistics,
  FaceitRankings,

  // composite routes
  Competitions,
  Teams,
};
