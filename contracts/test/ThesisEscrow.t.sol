// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ThesisEscrow} from "../src/ThesisEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract ThesisEscrowTest is Test {
    MockUSDC usdc;
    ThesisEscrow escrow;
    uint256 makerKey = 0xA11CE;
    address maker;
    address taker = address(0xB0B);
    address resolver;

    function setUp() public {
        maker = vm.addr(makerKey);
        resolver = address(this);
        usdc = new MockUSDC();
        escrow = new ThesisEscrow(address(usdc), resolver, address(this));
        usdc.mint(maker, 1_000_000e6);
        usdc.mint(taker, 1_000_000e6);
        vm.prank(maker);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(taker);
        usdc.approve(address(escrow), type(uint256).max);
        vm.prank(maker);
        escrow.deposit(200e6);
    }

    function _quote(uint256 maxPayout, uint256 premium, uint256 fee, uint256 nonce, bytes32 payoffHash)
        internal
        view
        returns (ThesisEscrow.Quote memory q)
    {
        q = ThesisEscrow.Quote({
            maker: maker,
            taker: taker,
            escrow: address(escrow),
            token: address(usdc),
            familyHash: bytes32(uint256(1)),
            payoffHash: payoffHash,
            maxPayout: maxPayout,
            premium: premium,
            fee: fee,
            nonce: nonce,
            issuedAt: block.timestamp,
            deadline: block.timestamp + 600,
            chainId: block.chainid
        });
    }

    function _sign(ThesisEscrow.Quote memory q) internal view returns (bytes memory) {
        bytes32 digest = escrow.hashQuote(q);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(makerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function testAcceptResolveClaimConservation() public {
        uint256[] memory schedule = new uint256[](3);
        schedule[0] = 0;
        schedule[1] = 100e6;
        schedule[2] = 0;
        bytes32 payoffHash = keccak256(abi.encode(schedule));
        ThesisEscrow.Quote memory q = _quote(100e6, 40e6, 1e6, 1, payoffHash);
        bytes memory sig = _sign(q);
        vm.prank(taker);
        uint256 id = escrow.accept(q, schedule, sig);
        escrow.resolve(id, 1);
        uint256 takerBefore = usdc.balanceOf(taker);
        uint256 makerBefore = usdc.balanceOf(maker);
        vm.prank(taker);
        escrow.claim(id);
        assertEq(usdc.balanceOf(taker) - takerBefore, 100e6);
        assertEq(usdc.balanceOf(maker) - makerBefore, 40e6);
    }

    function testVoidRefundsPremium() public {
        uint256[] memory schedule = new uint256[](2);
        schedule[0] = 0;
        schedule[1] = 50e6;
        bytes32 payoffHash = keccak256(abi.encode(schedule));
        ThesisEscrow.Quote memory q = _quote(50e6, 10e6, 0, 2, payoffHash);
        vm.prank(taker);
        uint256 id = escrow.accept(q, schedule, _sign(q));
        escrow.voidPosition(id);
        uint256 takerBefore = usdc.balanceOf(taker);
        vm.prank(taker);
        escrow.claim(id);
        assertEq(usdc.balanceOf(taker) - takerBefore, 10e6);
    }

    function testRejectExpired() public {
        uint256[] memory schedule = new uint256[](1);
        schedule[0] = 10e6;
        bytes32 payoffHash = keccak256(abi.encode(schedule));
        ThesisEscrow.Quote memory q = _quote(10e6, 4e6, 0, 3, payoffHash);
        q.deadline = block.timestamp - 1;
        vm.prank(taker);
        vm.expectRevert(ThesisEscrow.Expired.selector);
        escrow.accept(q, schedule, _sign(q));
    }
}
