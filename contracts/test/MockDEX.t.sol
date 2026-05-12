// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../src/MockERC20.sol";
import {MockDEX} from "../src/MockDEX.sol";

contract MockDEXTest is Test {
    MockERC20 t0;
    MockERC20 t1;
    MockDEX dex;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        t0 = new MockERC20("Token0", "TK0", 18);
        t1 = new MockERC20("Token1", "TK1", 18);
        dex = new MockDEX(address(t0), address(t1));

        t0.mint(address(this), 1_000_000 ether);
        t1.mint(address(this), 1_000_000 ether);
        t0.approve(address(dex), type(uint256).max);
        t1.approve(address(dex), type(uint256).max);

        t0.mint(alice, 1_000 ether);
        t1.mint(alice, 1_000 ether);
        vm.startPrank(alice);
        t0.approve(address(dex), type(uint256).max);
        t1.approve(address(dex), type(uint256).max);
        vm.stopPrank();
    }

    function test_deploy_sets_tokens() public view {
        assertEq(dex.token0(), address(t0));
        assertEq(dex.token1(), address(t1));
    }

    function test_constructor_reverts_zero() public {
        vm.expectRevert(bytes("MockDEX: ZERO_TOKEN"));
        new MockDEX(address(0), address(t1));
    }

    function test_constructor_reverts_identical() public {
        vm.expectRevert(bytes("MockDEX: IDENTICAL_TOKENS"));
        new MockDEX(address(t0), address(t0));
    }

    function test_add_initial_liquidity() public {
        uint256 shares = dex.addLiquidity(100_000 ether, 100_000 ether);
        assertGt(shares, 0);
        (uint112 r0, uint112 r1) = dex.getReserves();
        assertEq(r0, 100_000 ether);
        assertEq(r1, 100_000 ether);
    }

    function test_swap_zero_for_one() public {
        dex.addLiquidity(100_000 ether, 100_000 ether);
        uint256 expected = dex.quote(1_000 ether, address(t0));
        vm.startPrank(alice);
        uint256 out = dex.swap(1_000 ether, address(t0), 0, alice);
        vm.stopPrank();
        assertEq(out, expected);
        assertGt(out, 0);
        // 30 bps fee means out < amountIn
        assertLt(out, 1_000 ether);
    }

    function test_swap_one_for_zero() public {
        dex.addLiquidity(100_000 ether, 100_000 ether);
        uint256 expected = dex.quote(500 ether, address(t1));
        vm.startPrank(alice);
        uint256 out = dex.swap(500 ether, address(t1), 0, alice);
        vm.stopPrank();
        assertEq(out, expected);
    }

    function test_swap_slippage_revert() public {
        dex.addLiquidity(100_000 ether, 100_000 ether);
        uint256 q = dex.quote(1_000 ether, address(t0));
        vm.startPrank(alice);
        vm.expectRevert(bytes("MockDEX: SLIPPAGE"));
        dex.swap(1_000 ether, address(t0), q + 1, alice);
        vm.stopPrank();
    }

    function test_swap_bad_token() public {
        dex.addLiquidity(100_000 ether, 100_000 ether);
        MockERC20 bogus = new MockERC20("X", "X", 18);
        vm.expectRevert(bytes("MockDEX: BAD_TOKEN"));
        dex.swap(1 ether, address(bogus), 0, alice);
    }

    function test_price_impact_large_swap() public {
        dex.addLiquidity(100_000 ether, 100_000 ether);
        uint256 outSmall = dex.quote(100 ether, address(t0));
        uint256 outLarge = dex.quote(50_000 ether, address(t0));
        // per-unit price worsens as size grows
        assertLt(outLarge * 100, outSmall * 50_000);
    }

    function test_remove_liquidity() public {
        uint256 shares = dex.addLiquidity(100_000 ether, 100_000 ether);
        (uint256 a0, uint256 a1) = dex.removeLiquidity(shares);
        assertGt(a0, 0);
        assertGt(a1, 0);
    }

    function test_remove_liquidity_too_much() public {
        uint256 shares = dex.addLiquidity(100_000 ether, 100_000 ether);
        vm.expectRevert(bytes("MockDEX: INSUFFICIENT_SHARES"));
        dex.removeLiquidity(shares + 1);
    }

    function test_swap_emits_event() public {
        dex.addLiquidity(100_000 ether, 100_000 ether);
        vm.startPrank(alice);
        vm.expectEmit(true, true, true, false, address(dex));
        emit MockDEX.Swap(alice, address(t0), 1_000 ether, 0, alice);
        dex.swap(1_000 ether, address(t0), 0, alice);
        vm.stopPrank();
    }

    function test_reserves_grow_then_shrink() public {
        dex.addLiquidity(100_000 ether, 100_000 ether);
        vm.startPrank(alice);
        dex.swap(1_000 ether, address(t0), 0, alice);
        vm.stopPrank();
        (uint112 r0, uint112 r1) = dex.getReserves();
        assertGt(r0, 100_000 ether);
        assertLt(r1, 100_000 ether);
    }
}
