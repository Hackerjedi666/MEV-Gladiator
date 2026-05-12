// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Coliseum} from "../src/Coliseum.sol";

contract ColiseumTest is Test {
    Coliseum c;
    address coordinator = address(0xC0);
    address bot1 = address(0xB001);
    address bot2 = address(0xB002);

    function setUp() public {
        c = new Coliseum(coordinator);
    }

    function test_owner_set() public view {
        assertEq(c.owner(), coordinator);
    }

    function test_register_bot() public {
        vm.prank(bot1);
        c.registerBot("0xR1PP3R");
        (string memory name,,,,, bool exists) = c.getBotInfo(bot1);
        assertEq(name, "0xR1PP3R");
        assertTrue(exists);
        assertEq(c.getBotCount(), 1);
    }

    function test_register_double_revert() public {
        vm.startPrank(bot1);
        c.registerBot("A");
        vm.expectRevert(Coliseum.AlreadyRegistered.selector);
        c.registerBot("B");
        vm.stopPrank();
    }

    function test_register_bad_name_empty() public {
        vm.prank(bot1);
        vm.expectRevert(Coliseum.BadDisplayName.selector);
        c.registerBot("");
    }

    function test_register_bad_name_too_long() public {
        string memory tooLong = "abcdefghijklmnopqrstuvwxy"; // 25 chars
        vm.prank(bot1);
        vm.expectRevert(Coliseum.BadDisplayName.selector);
        c.registerBot(tooLong);
    }

    function test_register_bad_name_leading_space() public {
        vm.prank(bot1);
        vm.expectRevert(Coliseum.BadDisplayName.selector);
        c.registerBot(" leading");
    }

    function test_register_bad_name_non_ascii() public {
        vm.prank(bot1);
        vm.expectRevert(Coliseum.BadDisplayName.selector);
        // 0x7F is DEL, outside printable
        c.registerBot(string(abi.encodePacked(bytes1(0x7F))));
    }

    function test_start_round_only_owner() public {
        vm.expectRevert(Coliseum.NotOwner.selector);
        c.startRound();
    }

    function test_round_lifecycle() public {
        vm.prank(coordinator);
        c.startRound();
        assertTrue(c.roundActive());
        assertEq(c.currentRoundId(), 1);

        vm.prank(coordinator);
        c.endRound(address(0));
        assertFalse(c.roundActive());

        vm.prank(coordinator);
        c.startRound();
        assertEq(c.currentRoundId(), 2);
    }

    function test_start_round_twice_revert() public {
        vm.startPrank(coordinator);
        c.startRound();
        vm.expectRevert(Coliseum.RoundAlreadyActive.selector);
        c.startRound();
        vm.stopPrank();
    }

    function test_end_round_inactive_revert() public {
        vm.prank(coordinator);
        vm.expectRevert(Coliseum.RoundNotActive.selector);
        c.endRound(address(0));
    }

    function test_record_extraction_only_owner() public {
        vm.prank(bot1);
        c.registerBot("R1");
        vm.prank(coordinator);
        c.startRound();
        vm.expectRevert(Coliseum.NotOwner.selector);
        c.recordExtraction(bot1, 1, 100, 10, "");
    }

    function test_record_extraction_not_registered() public {
        vm.prank(coordinator);
        c.startRound();
        vm.prank(coordinator);
        vm.expectRevert(Coliseum.NotRegistered.selector);
        c.recordExtraction(bot1, 1, 100, 10, "");
    }

    function test_record_extraction_round_not_active() public {
        vm.prank(bot1);
        c.registerBot("R1");
        vm.prank(coordinator);
        vm.expectRevert(Coliseum.RoundNotActive.selector);
        c.recordExtraction(bot1, 1, 100, 10, "");
    }

    function test_record_extraction_accumulates() public {
        vm.prank(bot1);
        c.registerBot("R1");
        vm.prank(coordinator);
        c.startRound();

        vm.startPrank(coordinator);
        c.recordExtraction(bot1, 1, 100, 10, "first blood");
        c.recordExtraction(bot1, 2, 250, 15, "");
        vm.stopPrank();

        (, uint256 total, uint256 kills, uint256 gas,,) = c.getBotInfo(bot1);
        assertEq(total, 350);
        assertEq(kills, 2);
        assertEq(gas, 25);
    }

    function test_leaderboard() public {
        vm.prank(bot1);
        c.registerBot("R1");
        vm.prank(bot2);
        c.registerBot("R2");
        vm.prank(coordinator);
        c.startRound();
        vm.startPrank(coordinator);
        c.recordExtraction(bot1, 1, 100, 0, "");
        c.recordExtraction(bot2, 2, 250, 0, "");
        c.recordExtraction(bot2, 3, 50, 0, "");
        vm.stopPrank();

        (address[] memory addrs, uint256[] memory totals) = c.getLeaderboard();
        assertEq(addrs.length, 2);
        assertEq(totals.length, 2);
        // order is registration order
        assertEq(addrs[0], bot1);
        assertEq(totals[0], 100);
        assertEq(addrs[1], bot2);
        assertEq(totals[1], 300);
    }

    function test_transfer_ownership() public {
        address newOwner = address(0xD0);
        vm.prank(coordinator);
        c.transferOwnership(newOwner);
        assertEq(c.owner(), newOwner);
    }

    function test_transfer_ownership_only_owner() public {
        vm.expectRevert(Coliseum.NotOwner.selector);
        c.transferOwnership(address(0xD0));
    }
}
