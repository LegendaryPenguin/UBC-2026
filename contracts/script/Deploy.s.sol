// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {ThesisEscrow} from "../src/ThesisEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract Deploy is Script {
    function run() external {
        uint256 key = vm.envUint("PRIVATE_KEY");
        address token = vm.envOr("USDC", address(0x3600000000000000000000000000000000000000));
        bool deployMock = vm.envOr("DEPLOY_MOCK_USDC", false);
        vm.startBroadcast(key);
        if (deployMock) {
            MockUSDC mock = new MockUSDC();
            token = address(mock);
        }
        ThesisEscrow escrow = new ThesisEscrow(token, vm.addr(key), vm.addr(key));
        vm.stopBroadcast();
        console2.log("token", token);
        console2.log("escrow", address(escrow));
    }
}
