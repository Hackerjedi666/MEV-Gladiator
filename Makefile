.PHONY: install deploy seed drift verify clean dev demo check-env deploy-dry bots

# Loads .env from repo root for every target that needs it.
ENV_FILE ?= .env
ifneq (,$(wildcard $(ENV_FILE)))
include $(ENV_FILE)
export
endif

install:
	pnpm install
	cd contracts && forge install foundry-rs/forge-std --no-git || true
	cd contracts && forge install OpenZeppelin/openzeppelin-contracts --no-git || true

check-env:
	@test -n "$$MONAD_RPC_URL"              || (echo "MONAD_RPC_URL unset" && exit 1)
	@test -n "$$DEPLOYER_PRIVATE_KEY"       || (echo "DEPLOYER_PRIVATE_KEY unset" && exit 1)
	@test -n "$$COORDINATOR_PUBLIC_ADDRESS" || (echo "COORDINATOR_PUBLIC_ADDRESS unset" && exit 1)

deploy: check-env
	cd contracts && forge script script/Deploy.s.sol --rpc-url $$MONAD_RPC_URL --broadcast --legacy --private-key $$DEPLOYER_PRIVATE_KEY -vvv

seed: check-env
	@test -n "$$VICTIM_PUBLIC_ADDRESS"      || (echo "VICTIM_PUBLIC_ADDRESS unset" && exit 1)
	cd contracts && forge script script/Seed.s.sol --rpc-url $$MONAD_RPC_URL --broadcast --legacy --private-key $$DEPLOYER_PRIVATE_KEY -vvv

drift: check-env
	cd contracts && forge script script/Drift.s.sol --rpc-url $$MONAD_RPC_URL --broadcast --legacy --private-key $$DEPLOYER_PRIVATE_KEY -vvv

# Dry-run (no broadcast) against a local anvil fork.
deploy-dry:
	cd contracts && forge script script/Deploy.s.sol -vvv

verify:
	@echo "Verify per contract: cd contracts && forge verify-contract <addr> <ContractName> --chain-id $$MONAD_CHAIN_ID --verifier sourcify --verifier-url <TBD>"

clean:
	rm -rf node_modules contracts/out contracts/cache dashboard/.next
	pnpm -r exec rm -rf node_modules dist .next 2>/dev/null || true

dev:
	bash scripts/start-all.sh

bots:
	@echo "starting all six reference bots (Ctrl+C to stop)"
	@cd bots && bun run random.ts & \
	  cd bots && bun run naive-arb.ts & \
	  cd bots && bun run naive-sandwich.ts & \
	  cd bots && bun run liquidator.ts & \
	  cd bots && bun run jit-lp.ts & \
	  cd bots && bun run whale-watch.ts & \
	  wait
