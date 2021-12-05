'use strict';

exports.postToolbarInit = (hookName, context) => {
  const {ep_readonly_guest: {isGuest} = {}} = clientVars;
  if (isGuest == null) return; // This can happen with the timeslider.
  if (isGuest) $('#myusernameedit').attr('disabled', true);
};
