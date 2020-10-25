'use strict';

/* global exports, require */

const $ = require('cheerio');
const assert = require('assert').strict;
const authorManager = require('ep_etherpad-lite/node/db/AuthorManager');
const log4js = require('ep_etherpad-lite/node_modules/log4js');
const plugins = require('ep_etherpad-lite/static/js/pluginfw/plugin_defs');

const pluginName = 'ep_readonly_guest';
const logger = log4js.getLogger(pluginName);
let user;

const endpoint = (ep) => `/${encodeURIComponent(pluginName)}/${ep}`;

exports.authenticate = (hookName, {req}, cb) => {
  logger.debug(`${hookName} ${req.url}`);
  // If the user is visiting the 'forceauth' endpoint then fall through to the next authenticate
  // plugin (or to the built-in basic auth). This is what forces the real authentication.
  if (req.path === endpoint('forceauth')) return cb([]);
  req.session.user = user;
  assert(req.session.user.readOnly);
  assert(!req.session.user.is_admin);
  return cb([true]);
};

exports.clientVars = async (hookName, {socket: {client: {request: req}}}) => {
  logger.debug(hookName);
  const {session: {user: {username} = {}} = {}} = req;
  const vars = {};
  vars[pluginName] = {isGuest: username === user.username};
  return vars;
};

exports.eejsBlock_userlist = (hookName, context, cb) => {
  logger.debug(hookName);
  const req = context.renderContext.req;
  const {user: {username} = {}} = req.session;
  const isGuest = username === user.username;
  const ep = isGuest ? 'login' : 'logout';
  const buttonUri = `${endpoint(ep)}?redirect_uri=${encodeURIComponent(req.url)}`;
  const buttonText = isGuest ? 'Log In' : 'Log Out';
  const content = $('<div>').html(context.content);
  content.find('#myuser').append(
      $('<div>')
          .addClass('btn-container')
          .css('margin-left', '10px')
          .append(
              $('<a>')
                  .attr('href', buttonUri)
                  .addClass('btn')
                  .addClass('btn-primary')
                  .attr('data-l10n-id', `${pluginName}_${ep}`)
                  .text(buttonText)));
  context.content = content.html();
  return cb();
};

// Note: The expressCreateServer hook is executed after plugins have been loaded, including after
// installing a plugin from the admin page.
exports.expressCreateServer = (hookName, {app}) => {
  logger.debug(hookName);
  // Make sure this plugin's authenticate function is called before any other plugin's authenticate
  // function, otherwise users will not be able to visit pads as the guest user.
  plugins.hooks.authenticate.sort((a, b) => a.part.name === pluginName ? -1 : 0);
  // Login is handled by two endpoints:
  //   1. The 'login' endpoint destroys the Express session state and redirects the user to the
  //      'forceauth' endpoint.
  //   2. The 'forceauth' endpoint forces the user to authenticate with Etherpad, then redirects the
  //      user back to wherever they came from. (How this works: This plugin's authenticate function
  //      defers the authn decision if the user visits the 'forcelogin' endpoint, which causes
  //      Etherpad to fall back to the next authenticate plugin or to the built-in HTTP basic auth
  //      if there is no other authn plugin.)
  // Endpoint #1 is only needed if the user is already logged in as guest (or another user). These
  // steps cannot be combined in a single handler because the Express route needs to restart from
  // the beginning after the session is destroyed. I couldn't find a good way to do that other than
  // to force the user to visit a different URL.
  app.get(endpoint('login'), (req, res, next) => {
    logger.debug(req.url);
    // Use a relative URL when redirecting to the 'forceauth' endpoint in case the reverse proxy is
    // configured to offset the Etherpad paths (e.g., /etherpad/p/foo instead of /p/foo).
    const epAndQuery = req.url.split('/').slice(-1)[0].split('?');
    epAndQuery[0] = 'forceauth';
    req.session.destroy(() => res.redirect(epAndQuery.join('?')));
  });
  app.get(endpoint('forceauth'), (req, res, next) => {
    logger.debug(req.url);
    res.redirect(req.query.redirect_uri || '..');
  });
  app.get(endpoint('logout'), (req, res, next) => {
    logger.debug(req.url);
    req.session.destroy(() => res.redirect(req.query.redirect_uri || '..'));
  });
};

exports.handleMessage = async (hookName, {message, client}) => {
  logger.debug(hookName);
  if (user.displayname == null) return;
  const {user: {username} = {}} = client.client.request.session;
  const {type, data: {type: dType} = {}} = message || {};
  if (type === 'CLIENT_READY') {
    // TODO: author ID might come from session ID, not token.
    const authorId = await authorManager.getAuthor4Token(message.token);
    if (username === user.username) {
      await authorManager.setAuthorName(authorId, user.displayname);
    } else if (await authorManager.getAuthorName(authorId) === user.displayname) {
      // The non-guest user's display name is "Read-Only Guest", so clear it to avoid confusion.
      await authorManager.setAuthorName(authorId, null);
    }
  } else if (username === user.username && type === 'COLLABROOM' && dType === 'USERINFO_UPDATE') {
    const {userInfo = {}} = message.data;
    userInfo.name = user.displayname;
  }
};

exports.loadSettings = async (hookName, {settings}) => {
  logger.debug(hookName);
  if (settings[pluginName] == null) settings[pluginName] = {};
  const s = settings[pluginName];
  s.guest_username = s.guest_username || 'guest';
  if (!('guest_displayname' in s)) s.guest_displayname = 'Read-Only Guest';
  if (settings.users[s.guest_username] == null) settings.users[s.guest_username] = {};
  user = settings.users[s.guest_username];
  user.username = s.guest_username;
  user.displayname = user.displayname || s.guest_displayname;
  user.readOnly = true;
  user.is_admin = false;
};

exports.preAuthorize = (hookName, {req}, cb) => {
  // Don't bother logging the user in as guest if they're simply visiting the 'login' endpoint.
  if (req.path === endpoint('login')) return cb([true]);
  return cb([]);
};
