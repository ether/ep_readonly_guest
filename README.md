# ep\_readonly\_guest

![Screenshot](docs/img/screenshot.png)

Etherpad plugin that grants read-only access to users that are not logged in.

When a user first visits Etherpad, they will be "authenticated" as a guest user
that does not have permission to create or modify pads. A "log in" button in the
user drop-down list forces the user to authenticate via Etherpad's built-in HTTP
basic authentication or via an authentication plugin (if one is installed).
After logging in, the "log in" button becomes a "log out" button.

## Settings

All settings are optional. The defaults are shown here:

```json
  "ep_readonly_guest": {
    "guest_username": "guest",
    "guest_displayname": "Read-Only Guest"
  },
```

* `guest_username` is the username used for the guest account.
* `guest_displayname` is the name that appears in the user drop-down list for
  guest users. Guests are unable to change the name unless this is set to
  `null`.

## Copyright and License

Copyright © 2020 Richard Hansen <rhansen@rhansen.org>

Licensed under the terms of the [Apache 2.0 license](LICENSE).
