# EchoEcho monorepo commands
# Usage: just <command>

# Install all workspace dependencies
install:
    yarn install

# Run the admin app
admin:
    yarn workspace @echoecho/admin start

# Run the student app
student:
    yarn workspace @echoecho/student start

# Typecheck all workspaces
check:
    yarn workspaces run typecheck

# Run linters across workspaces
lint:
    yarn workspaces run lint

# Run tests across workspaces
test:
    yarn workspaces run test --passWithNoTests

# Full CI gate: typecheck + lint + test
ci: check lint test

# Build admin app for iOS dev (requires Xcode)
build-admin-ios:
    yarn workspace @echoecho/admin ios

# Build student app for iOS dev (requires Xcode)
build-student-ios:
    yarn workspace @echoecho/student ios

# Build admin app for Android dev (requires Android Studio)
build-admin-android:
    yarn workspace @echoecho/admin android

# Build student app for Android dev (requires Android Studio)
build-student-android:
    yarn workspace @echoecho/student android

# Clean all node_modules and caches
clean:
    find . -name node_modules -type d -prune -exec rm -rf {} +
    find . -name .expo -type d -prune -exec rm -rf {} +
    yarn cache clean
