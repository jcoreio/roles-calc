# roles-calc

Resolves whether a user can perform an action based on hierarchical roles

## Installation

```sh
yarn add @jcoreio/roles-calc
```
or
```sh
npm install --save @jcoreio/roles-calc
```

## Usage

#### Calculate basic roles

```js
const RolesCalc = require('@jcoreio/roles-calc')

const rc = new RolesCalc()

rc.isAuthorized({required: 'employee', actual: ['employee', 'manager']}) // true
rc.isAuthorized({required: 'owner', actual: ['employee', 'manager']}) // false
rc.isAuthorized({required: 'owner', actual: 'owner'}) // true, 'actual' can be a string or array
```

#### Calculate roles with simple inheritance

```js
const rc = new RolesCalc()
rc.role('owner').extends(['manager', 'employee'])

rc.isAuthorized({required: 'employee', actual: 'owner'}) // true, owner > employee
rc.isAuthorized({required: 'manager', actual: 'owner'}) // true, owner > manager
rc.isAuthorized({required: 'owner', actual: 'manager'}) // false, manager < owner
```

#### Calculate roles with multi level inheritance

```js
const rc = new RolesCalc()
rc.role('manager').extends('employee')
rc.role('owner').extends('manager')

rc.isAuthorized({required: 'employee', actual: 'owner'}) // true, owner > manager > employee
rc.isAuthorized({required: 'employee', actual: 'manager'}) // true, manager > employee
rc.isAuthorized({required: 'owner', actual: 'manager'}) // false, manager < owner
```

#### Always allow 'admin' or similar permissions

```js
const rc = new RolesCalc({alwaysAllow: 'admin'})

rc.isAuthorized({required: 'employee', actual: 'admin'}) // true, admin is always authorized
rc.isAuthorized({required: 'employee', actual: 'owner'}) // false, owner wasn't included in alwaysAllow
```

```js
const rc = new RolesCalc({alwaysAllow: ['admin', 'owner']})

rc.isAuthorized({required: 'employee', actual: 'admin'}) // true, admin is always authorized
rc.isAuthorized({required: 'employee', actual: 'owner'}) // true, owner is always authorized
```

#### `resource:write` permissions extend `resource:read` permissions by default

```js
const rc = new RolesCalc()

rc.isAuthorized({required: 'site:read', actual: 'site:write'}) // true, resource:write > resource:read
rc.isAuthorized({required: 'site:explode', actual: 'site:write'}) // false, resource:write does not extend unrelated actions by default
rc.isAuthorized({required: 'site:explode', actual: 'site'}) // true, a general 'resource' role extends all 'resource:action' roles
```

#### Disabling inheritance of `resource:read` by `resource:write`

```js
const rc = new RolesCalc({writeExtendsRead: false})

rc.isAuthorized({required: 'site:read', actual: 'site:write'}) // false when write does not extend read
rc.isAuthorized({required: 'site:explode', actual: 'site'}) // true, a general 'resource' role extends all 'resource:action' roles, even when 'resource:write' does not extend 'resource:read'
```
