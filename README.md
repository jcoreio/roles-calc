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

A collection of roles can be specified in one of four ways:

- An `Array` of role names
- A `Set` of role names
- An `Object` where the key is the role name and the value is `true` iff the user has the role
- A single role name (`string`)

`@jcoreio/roles-calc` exports `rolesToArray`, `rolesToSet`, `rolesToObject`,
and `rolesToIterable` for converting between these forms.

```js
rolesToArray({ employee: true, manager: true, owner: false }) // ['employee', 'manager']
rolesToObject(new Set(['employee', 'manager'])) // {employee: true, manager: true}
```

#### Calculate basic roles

```js
const RolesCalc = require('@jcoreio/roles-calc')

const rc = new RolesCalc()

rc.isAuthorized({ required: 'employee', actual: ['employee', 'manager'] }) // true
rc.isAuthorized({ required: 'owner', actual: ['employee', 'manager'] }) // false
rc.isAuthorized({ required: 'owner', actual: 'owner' }) // true, 'actual' can be a string or array
```

#### Calculate roles with simple inheritance

```js
const rc = new RolesCalc()
rc.role('owner').extends(['manager', 'employee'])

rc.isAuthorized({ required: 'employee', actual: 'owner' }) // true, owner > employee
rc.isAuthorized({ required: 'manager', actual: 'owner' }) // true, owner > manager
rc.isAuthorized({ required: 'owner', actual: 'manager' }) // false, manager < owner
```

#### Calculate roles with multi level inheritance

```js
const rc = new RolesCalc()
rc.role('manager').extends('employee')
rc.role('owner').extends('manager')

rc.isAuthorized({ required: 'employee', actual: 'owner' }) // true, owner > manager > employee
rc.isAuthorized({ required: 'employee', actual: 'manager' }) // true, manager > employee
rc.isAuthorized({ required: 'owner', actual: 'manager' }) // false, manager < owner
```

#### Always allow 'admin' or similar permissions

```js
const rc = new RolesCalc({ alwaysAllow: 'admin' })

rc.isAuthorized({ required: 'employee', actual: 'admin' }) // true, admin is always authorized
rc.isAuthorized({ required: 'employee', actual: 'owner' }) // false, owner wasn't included in alwaysAllow
```

```js
const rc = new RolesCalc({ alwaysAllow: ['admin', 'owner'] })

rc.isAuthorized({ required: 'employee', actual: 'admin' }) // true, admin is always authorized
rc.isAuthorized({ required: 'employee', actual: 'owner' }) // true, owner is always authorized
```

#### `resource:action` roles

```js
const rc = new RolesCalc({ resourceActions: true })

rc.isAuthorized({ required: 'site:read', actual: 'site:write' }) // false writeExtendsRead option is not enabled
rc.isAuthorized({ required: 'site:explode', actual: 'site' }) // true, a general 'resource' role extends all 'resource:action' roles
```

#### `writeExtendsRead` option for resources

```js
const rc = new RolesCalc({ resourceActions: true, writeExtendsRead: true })

rc.isAuthorized({ required: 'site:read', actual: 'site:write' }) // true, resource:write > resource:read
rc.isAuthorized({ required: 'site:explode', actual: 'site:write' }) // false, resource:write does not extend unrelated actions by default
rc.isAuthorized({ required: 'site:explode', actual: 'site' }) // true, a general 'resource' role extends all 'resource:action' roles
```

#### Get set of all parent roles

```js
const rc = new RolesCalc()
rc.role('manager').extends('employee')
rc.role('owner').extends('manager')

rc.getParentRolesSet('employee') // 'owner', 'manager'
rc.getRoleAndParentRolesSet('employee') // 'owner', 'manager', 'employee'
```

#### Prune redundant roles

```js
const rc = new RolesCalc()
rc.role('manager').extends('employee')
rc.role('owner').extends('manager')

rc.pruneRedundantRolesSet(['manager', 'employee']) // new Set(['manager'])
rc.pruneRedundantRoles(['owner', 'manager', 'employee']) // ['owner']
```
